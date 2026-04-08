import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Filters from '@components/common-components/filters';
import Popup from '@components/core-components/modal/Popup';
import TabComponent from '@components/core-components/tabs';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLAYER_GAME_LIMITS_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import { useAppSelector } from 'hooks/redux';
import { getSupportedCurrencyOptions } from 'utils/common/currencyUtils';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';

import DataGridRenderer from './components/DataGridRenderer';
import FilterControls from './components/FilterControls';
import { PLAYER_TAB_CONFIGS, TAB_CONFIGS, TAB_CONFIGS_BY_TIME } from './constants';
import { clearEvent, isEventMarked } from './eventBuffer';
import {
  downloadCasinoStatsByCategoryCSV,
  downloadCasinoStatsByGameCSV,
  downloadCasinoStatsByProviderCSV,
} from './helper';

type LimitsProps = {
  activeTab: string;
  timeBased?: boolean;
  setActiveTab: (tab: string) => void;
  queryKey: string;
  gameLimitsEndpoint: string;
  heading?: string;
  limits: any[];
  deleteLimitEndpoint: (id: string) => string;
  toggleLimitEndpoint: (id: string) => string;
  includePlayerIdInQueryKey: boolean;
  permissionKeys: Record<string, string>;
  updateLimitEndpoint: (id: string) => string;
  eventMarker?: string;
  isRefetch?: boolean;
  markEvent?: () => void;
};

function Limitslist({
  activeTab,
  setActiveTab,
  queryKey,
  gameLimitsEndpoint,
  heading,
  limits,
  deleteLimitEndpoint,
  toggleLimitEndpoint,
  includePlayerIdInQueryKey,
  timeBased = false,
  permissionKeys,
  updateLimitEndpoint,
  eventMarker,
  isRefetch = false,
  markEvent,
}: LimitsProps) {
  const [filterParams, setFilterParams] = useState<Record<string, any>>({});
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [showTags, setShowTags] = useState<boolean>(false);
  const [selectedBy, setSelectedBy] = useState('');
  const [category, setCategory] = useState<any>(null);
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [currency, setCurrency] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null);
  const permissions = useAppSelector((state) => state.auth.permissions);
  const providers = useAppSelector((state) => state.sharedData.unfilteredProviders);
  const categories = useAppSelector((state) => state.sharedData.categories);
  const games = useAppSelector((state) => state.sharedData.games);
  const player = useAppSelector((state) => state.sharedData.player);
  const permissionGroups = useMemo(() => extractPermissionGroups(permissions), [permissions]);

  const permissionChecks = useMemo(
    () => ({
      hasView: checkPermission(permissionGroups, permissionKeys.VIEW),
      canAdd: checkPermission(permissionGroups, permissionKeys.CREATE),
      canEdit: checkPermission(permissionGroups, permissionKeys.EDIT),
      canDelete: checkPermission(permissionGroups, permissionKeys.DELETE),
      canEditColumns: checkPermission(permissionGroups, permissionKeys.EDIT_COLUMNS),
      canDownloadCsv: checkPermission(permissionGroups, permissionKeys.DOWNLOAD_CSV),
    }),
    [
      permissionGroups,
      permissionKeys.VIEW,
      permissionKeys.CREATE,
      permissionKeys.EDIT,
      permissionKeys.DELETE,
      permissionKeys.EDIT_COLUMNS,
      permissionKeys.DOWNLOAD_CSV,
    ]
  );

  const currencyArray = useMemo(() => getSupportedCurrencyOptions(), []);

  useEffect(() => {
    const limitedBy =
      activeTab === 'by-category'
        ? 'category'
        : activeTab === 'by-all'
          ? 'all'
          : activeTab === 'by-game'
            ? 'game'
            : activeTab === 'by-provider'
              ? 'provider'
              : '';

    setFilterParams((prev) => ({
      ...prev,
      limitedBy,
    }));
  }, [activeTab]);

  const handleExportCSV = () => {
    const data = limitsQuery.data?.data || [];

    if (activeTab === 'by-category') {
      downloadCasinoStatsByCategoryCSV(data);
    } else if (activeTab === 'by-provider') {
      downloadCasinoStatsByProviderCSV(data);
    } else if (activeTab === 'by-game') {
      downloadCasinoStatsByGameCSV(data);
    }
  };

  const gameOptions = useMemo(() => {
    return (
      games?.map((item: any) => ({
        value: item._id.toString(),
        label: item.game_name,
      })) || []
    );
  }, [games]);

  const tabs = useMemo(
    () =>
      Object.entries(
        timeBased
          ? TAB_CONFIGS_BY_TIME
          : includePlayerIdInQueryKey
            ? PLAYER_TAB_CONFIGS
            : TAB_CONFIGS
      )
        .filter(([_key, _config]) => permissionChecks.hasView)
        .map(([key, config]) => ({
          key,
          label: config.label,
        })),
    [permissionChecks.hasView, includePlayerIdInQueryKey, timeBased]
  );

  const filterParamsToString = (params: any) => {
    const filteredParams = Object.keys(params).reduce((acc: any, key: string) => {
      const value = params[key];
      if (typeof value === 'object' && value !== null && (value.id || value.value)) {
        const val = value.id || value.value;
        acc[key] = val;
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
    const query = Object.keys(filteredParams)
      .map((key) => `${key}=${encodeURIComponent(filteredParams[key])}`)
      .join('&');

    return query ? `&${query}` : '';
  };

  const endpoint =
    activeTab === 'player-limits'
      ? PLAYER_GAME_LIMITS_API_URLS.GET_ALL() + '/complete'
      : gameLimitsEndpoint + filterParamsToString(filterParams);

  const queryKeyArray = useMemo(() => {
    if (activeTab === 'player-limits') return [queryKey, 'player-limits'];
    return includePlayerIdInQueryKey
      ? [queryKey, player?._id, filterParams]
      : [queryKey, filterParams];
  }, [queryKey, player?._id, filterParams, includePlayerIdInQueryKey, activeTab]);

  const isEnabled = useMemo(() => {
    if (activeTab === 'player-limits') return true;
    const hasFilters = Object.keys(filterParams).length > 0;
    return includePlayerIdInQueryKey ? !!player?._id && hasFilters : hasFilters;
  }, [includePlayerIdInQueryKey, player?._id, filterParams, activeTab]);

  const limitsQuery = useBaseQuery<any>({
    endpoint,
    queryKey: queryKeyArray,
    enabled: isEnabled,
  });

  useEffect(() => {
    if (eventMarker && isEventMarked(eventMarker) && isRefetch) {
      limitsQuery.refetch();
      clearEvent(eventMarker);
    }
  }, [eventMarker, isRefetch, limitsQuery]);

  if (!permissionChecks.hasView) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasTab = tabs.find((tab) => tab?.key === activeTab);
  if (!activeTab || !hasTab) {
    return tabs.length > 0 ? (
      <Navigate to="/dashboard" replace />
    ) : (
      <Navigate to="/dashboard" replace />
    );
  }

  const handleTabChange = (key: string) => {
    handleReset();
    setActiveTab(key);
    if (key !== 'player-limits') {
      const limitedBy =
        key === 'by-category'
          ? 'category'
          : key === 'by-all'
            ? 'all'
            : key === 'by-game'
              ? 'game'
              : key === 'by-provider'
                ? 'provider'
                : '';

      setFilterParams((prev) => ({
        ...prev,
        limitedBy,
      }));
    }
  };

  const handleSwitchToggle = async (rowIndex: number) => {
    const row = limitsQuery.data?.data[rowIndex];
    if (!row?._id) return;

    setTogglingId(row._id);

    try {
      await axiosInstance.patch(toggleLimitEndpoint(row._id), {
        isEnabled: !row.isEnabled,
      });
      markEvent && markEvent();
      limitsQuery.refetch();
    } catch (err) {
      console.error('Failed to toggle enable state:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (params: any) => {
    setSelectedDeleteId(params.data._id);
    setShowDeletePopup(true);
  };

  const confirmDelete = async () => {
    if (!selectedDeleteId) return;
    try {
      await axiosInstance.delete(deleteLimitEndpoint(selectedDeleteId));
      markEvent && markEvent();
      limitsQuery.refetch();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setShowDeletePopup(false);
      setSelectedDeleteId(null);
    }
  };

  const cancelDelete = () => {
    setShowDeletePopup(false);
    setSelectedDeleteId(null);
  };

  const handleReset = () => {
    setCategory(null);
    setSelectedGame(null);
    setProvider(null);
    setCurrency(null);
    setSelectedBy('');

    const { limitedBy, ...rest } = filterParams;

    if (Object.keys(rest).length > 0) {
      const newFilters: Record<string, any> = {};
      if (limitedBy) newFilters.limitedBy = limitedBy;

      setFilterParams(newFilters);
      setShowTags(false);
      setShowFilters(true);
    }
  };

  const removeFilter = (filterKey: string) => {
    const newFilters = { ...filterParams };
    delete newFilters[filterKey];
    setFilterParams(newFilters);

    const keysWithoutLimitedBy = Object.keys(newFilters).filter((key) => key !== 'limitedBy');

    if (keysWithoutLimitedBy.length === 0) {
      setShowTags(false);
      setShowFilters(true);
    }
  };

  const hasFiltersApplied = () => {
    const isLimitedByGame = filterParams?.limitedBy === 'game';

    return selectedGame || currency || (!isLimitedByGame && (category || provider));
  };

  const handleApplyFilters = () => {
    const filters = {
      ...(filterParams?.limitedBy && { limitedBy: filterParams.limitedBy }),
      ...(filterParams?.limitedBy !== 'game' && category && { category }),
      ...(selectedGame && { game: selectedGame }),
      ...(filterParams?.limitedBy !== 'game' && provider && { provider }),
      ...(currency && { currency }),
    };
    setFilterParams(filters);
    if (Object.keys(filters).length > 0) {
      setShowTags(true);
    }
  };

  const getColDefProps = () => {
    const baseProps = {
      canGeneralLimitEdit: permissionChecks.canEdit,
      handleSwitchToggle,
      handleDelete,
      canGeneralLimitDelete: permissionChecks.canDelete,
      togglingId,
    };

    return baseProps;
  };

  return (
    <>
      <span className={`pb-4 text-xl font-extrabold text-gray-900`}>
        Defined Limits {heading && `- ${heading}`}
      </span>
      <div className="w-full max-w-[850px] pb-4">
        <TabComponent
          tabs={tabs}
          activeTab={tabs.find((tab) => tab.key === activeTab)?.label || ''}
          onTabClick={(tab) => {
            const selectedTab = tabs.find((t) => t.label === tab.label);
            if (selectedTab) handleTabChange(selectedTab.key);
          }}
          buttonWidth="w-full"
        />
      </div>
      <div className="flex flex-col w-full">
        {activeTab !== 'by-all' && activeTab !== 'player-limits' && (
          <>
            {' '}
            <Filters
              closeFilters={showFilters}
              toggleFilters={() => setShowFilters(!showFilters)}
              renderInputs={() => (
                <FilterControls
                  categories={categories}
                  providers={providers}
                  activeTab={activeTab}
                  selectedBy={selectedBy}
                  setSelectedBy={setSelectedBy}
                  category={category}
                  setCategory={setCategory}
                  provider={provider}
                  setProvider={setProvider}
                  selectedGame={selectedGame}
                  setSelectedGame={setSelectedGame}
                  currency={currency}
                  setCurrency={setCurrency}
                  currencyArray={currencyArray}
                  gameOptions={gameOptions}
                />
              )}
              handleApplyFilters={handleApplyFilters}
              handleReset={handleReset}
              hasFiltersApplied={hasFiltersApplied()}
              showTags={showTags}
              filters={Object.fromEntries(
                Object.entries(filterParams).filter(([key]) => key !== 'limitedBy')
              )}
              removeFilter={removeFilter}
              handleExportCSV={handleExportCSV}
              canDownloadCsv={permissionChecks.canDownloadCsv}
              notDisableCsv
            />
          </>
        )}

        {permissionChecks.hasView && (
          <DataGridRenderer
            activeTab={activeTab}
            queryKey={queryKey}
            limits={limits}
            rowData={limitsQuery.data?.data}
            isLoading={limitsQuery.isLoading}
            getColDefProps={getColDefProps}
            updateLimitEndpoint={(id) => updateLimitEndpoint(id)}
            isRefetch={isRefetch}
            markEvent={markEvent}
          />
        )}
      </div>
      <Popup
        isOpen={showDeletePopup}
        title="Delete Limit"
        description="Are you sure you want to delete this limit?"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
}

export default Limitslist;
