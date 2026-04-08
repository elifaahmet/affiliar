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

import { getRestrictedProvidersColDef } from './colDef';
import { downloadRestrictedProvidersCSV, RestrictedProvidersApiResponse } from './helper';

interface RestrictedProvidersProps {
  gridApiRef?: React.MutableRefObject<GridApi | null>;
  canDelete: boolean;
  getEndpoint: string;
  deleteEndpoint: string;
  canEditColumns?: boolean;
  canDownloadCsv?: boolean;
}

function RestrictedProviders(props: RestrictedProvidersProps) {
  const { gridApiRef, canDelete, getEndpoint, deleteEndpoint, canDownloadCsv } = props;
  const [isLoading, setIsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [filterParams, setFilterParams] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const { showToast } = useToast();

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

        const endpoint = `${getEndpoint}?${fullQuery}&type=${RestrictionType.PROVIDER}`;

        interface RestrictedProvidersResponse {
          data: unknown[];
          total: number;
        }

        baseService
          .getAll<RestrictedProvidersResponse>(endpoint)
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
      deleteMutate({ providerIds: [selectedDeleteId] });
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

  const hasFiltersApplied = () => !!provider;

  const handleApplyFilters = () => {
    const filters = {
      ...(provider && { provider }),
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
    const queryParts: string[] = [`exportType=${exportType}`, `type=${RestrictionType.PROVIDER}`];
    if (exportType === 'filtered') {
      queryParts.push(`page=${currentPage}`, `limit=${pageSize}`);
    }
    if (Object.keys(filterParams).length > 0) {
      queryParts.push(filterParamsToString(filterParams));
    }
    const exportEndpoint = `${getEndpoint}?${queryParts.join('&')}`;

    setExportLoading(true);
    try {
      const data = await baseService.getAll<RestrictedProvidersApiResponse>(exportEndpoint);
      if (data?.data?.length > 0) {
        downloadRestrictedProvidersCSV(data);
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
          colDefs={getRestrictedProvidersColDef({ canDelete, handleDelete })}
          grandRow="bottom"
          disableFilter={true}
        />
      </div>

      <Popup
        isOpen={showDeletePopup}
        title="Remove Restriction"
        description="Are you sure you want to remove the restriction for this provider? All games under this provider will also be enabled and become available in the system."
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

export default RestrictedProviders;
