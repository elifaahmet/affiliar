import React, { useEffect, useState } from 'react';
import Filters from '@components/common-components/filters';
import { PDataGrid } from '@components/core-components/grid/PDataGrid';
import PInput from '@components/core-components/input';
import Popup from '@components/core-components/modal/Popup';
import { useToast } from '@components/core-components/toaster/ToastContext';
import type { GridApi, IServerSideGetRowsParams } from 'ag-grid-community';
import { GridReadyEvent } from 'ag-grid-enterprise';
import { baseService } from 'api/core/baseService';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useAppDispatch } from 'hooks/redux';
import { fetchGamesAndProviders } from 'store/sharedData/sharedDataSlice';
import { filterParamsToString } from 'utils/common/filterParamsToString';
import { RestrictionType } from 'utils/enums/restrictionEnums';

import { getRestrictedGamesColDef } from './colDef';
import { downloadRestrictedGamesCSV, RestrictedGamesApiResponse } from './helper';

interface RestrictedGamesProps {
  canDelete: boolean;
  gridApiRef?: React.MutableRefObject<GridApi | null>;
  getEndpoint: string;
  deleteEndpoint: string;
  canEditColumns?: boolean;
  canDownloadCsv?: boolean;
}

function RestrictedGames(props: RestrictedGamesProps) {
  const { canDelete, gridApiRef, getEndpoint, deleteEndpoint, canDownloadCsv } = props;
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [filterParams, setFilterParams] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const [game, setGame] = useState<string | null>(null);

  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  const createDataSource = React.useCallback(
    () => ({
      getRows: ({ request, success, fail }: IServerSideGetRowsParams) => {
        setIsLoading(true);
        const { startRow = 0, endRow } = request;
        const safeEndRow = endRow ?? startRow + 50;
        const limit = safeEndRow - startRow;
        const page = startRow / limit + 1;
        const isFilterActive = Object.keys(filterParams).length > 0;
        const baseParams = `page=${page}&limit=${limit}`;
        const filterQuery = isFilterActive ? `&${filterParamsToString(filterParams)}` : '';
        const fullQuery = `${baseParams}${filterQuery}`;

        const endpoint = `${getEndpoint}?${fullQuery}&type=${RestrictionType.GAME}`;

        interface RestrictedGamesResponse {
          data: unknown[];
          total: number;
        }

        baseService
          .getAll<RestrictedGamesResponse>(endpoint)
          .then((data) => success({ rowData: data.data || [], rowCount: data.total }))
          .catch(fail)
          .finally(() => setIsLoading(false));
      },
    }),
    [getEndpoint, filterParams]
  );

  const { mutate: deleteMutate, isPending } = useBaseMutation({
    endpoint: deleteEndpoint,
    method: 'post',
    onSuccess: (res) => {
      showToast(res?.message, 'success');
      gridApiRef?.current?.refreshServerSide?.();
      dispatch(fetchGamesAndProviders('testId'));
      cancelDelete();
    },
    onError: (error) => {
      showToast(error?.response?.data?.message, 'error');
    },
  });

  const confirmDelete = () => {
    if (selectedDeleteId) {
      deleteMutate({ gameIds: [selectedDeleteId] });
    }
  };

  const handleDelete = (id: string) => {
    setSelectedDeleteId(id);
    setShowDeletePopup(true);
  };

  const cancelDelete = () => {
    setShowDeletePopup(false);
    setSelectedDeleteId(null);
  };

  const handleReset = () => {
    setGame(null);
    setProvider(null);

    if (Object.keys(filterParams).length > 0) {
      setFilterParams({});
      setShowTags(false);
      setShowFilters(true);
    }
  };
  const removeFilter = (filterKey: string) => {
    const newFilters = { ...filterParams };
    delete newFilters[filterKey];
    setFilterParams(newFilters);

    if (Object.keys(newFilters).length === 0) {
      setShowTags(false);
      setShowFilters(true);
      handleReset();
    }
  };

  const hasFiltersApplied = () => !!provider || !!game;

  const handleApplyFilters = () => {
    const filters = {
      ...(provider && { provider }),
      ...(game && { game }),
    };
    setFilterParams(filters);
    setShowTags(true);
  };

  useEffect(() => {
    if (gridApiRef && gridApiRef.current && gridApiRef.current.setGridOption) {
      const dataSource = createDataSource();
      gridApiRef.current.setGridOption('serverSideDatasource', dataSource);
    }
  }, [filterParams, createDataSource, gridApiRef]);

  const handleExportCSV = async (exportMode?: 'selected' | 'full') => {
    const exportType = exportMode === 'full' ? 'full' : 'filtered';
    const api = gridApiRef?.current;
    const pageSize = api?.paginationGetPageSize?.() ?? 50;
    const currentPage = (api?.paginationGetCurrentPage?.() ?? 0) + 1;
    const queryParts: string[] = [`exportType=${exportType}`, `type=${RestrictionType.GAME}`];
    if (exportType === 'filtered') {
      queryParts.push(`page=${currentPage}`, `limit=${pageSize}`);
    }
    if (Object.keys(filterParams).length > 0) {
      queryParts.push(filterParamsToString(filterParams));
    }
    const exportEndpoint = `${getEndpoint}?${queryParts.join('&')}`;

    setExportLoading(true);
    try {
      const data = await baseService.getAll<RestrictedGamesApiResponse>(exportEndpoint);
      if (data?.data?.length > 0) {
        downloadRestrictedGamesCSV(data);
      }
    } finally {
      setExportLoading(false);
    }
  };

  const renderInputs = () => {
    return (
      <>
        <PInput
          placeholder="Provider"
          wrapperClassNames="h-full flex justify-center"
          value={provider || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setProvider(e.target.value);
          }}
        />
        <PInput
          placeholder="Game"
          wrapperClassNames="h-full flex justify-center"
          value={game || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setGame(e.target.value);
          }}
        />
      </>
    );
  };

  return (
    <>
      <div className="flex-grow h-full">
        <Filters
          closeFilters={showFilters}
          toggleFilters={() => setShowFilters(!showFilters)}
          renderInputs={renderInputs}
          handleApplyFilters={handleApplyFilters}
          handleReset={handleReset}
          hasFiltersApplied={hasFiltersApplied()}
          showTags={showTags}
          filters={filterParams}
          removeFilter={removeFilter}
          handleExportCSV={handleExportCSV}
          canDownloadCsv={canDownloadCsv}
          isLoadingCsv={exportLoading}
          notDisableCsv
        />
        <PDataGrid
          gridOptions={{
            rowModelType: 'serverSide',
            serverSideStoreType: 'partial',
            cacheBlockSize: 50,
          }}
          loading={isLoading}
          gridRef={gridApiRef}
          onGridReady={(params: GridReadyEvent) => {
            if (gridApiRef) {
              gridApiRef.current = params.api;
            }
            params.api.setGridOption('serverSideDatasource', createDataSource());
          }}
          rowModelType="serverSide"
          showFooter={true}
          colDefs={getRestrictedGamesColDef({ canDelete, handleDelete })}
          grandRow="bottom"
          disableFilter={true}
        />
      </div>

      <Popup
        isOpen={showDeletePopup}
        title="Remove Restriction"
        description="Are you sure you want to remove the restriction for this game? This game will become available again."
        onConfirm={confirmDelete}
        onClose={cancelDelete}
        confirmText={isPending ? 'Removing...' : 'Remove'}
        cancelText="Cancel"
        isLoading={isPending}
        iconName={'warning'}
      />
    </>
  );
}

export default RestrictedGames;
