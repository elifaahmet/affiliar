import React, { useMemo } from 'react';
import TabComponent from '@components/core-components/tabs';
import { GridApi } from 'ag-grid-enterprise';
import { RESTRICTION_LABELS, RestrictionType } from 'utils/enums/restrictionEnums';

import RestrictedGames from './components/restricted-games';
import RestrictedProviders from './components/restricted-providers';

interface RestrictionsListProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hasPermission: boolean;
  gridApiRef?: React.MutableRefObject<GridApi | null>;
  gamesGridApiRef?: React.MutableRefObject<GridApi | null>;
  canDelete: boolean;
  getEndpoint: string;
  deleteEndpoint: string;
  canEditColumns?: boolean;
  canDownloadCsv?: boolean;
}

function RestrictionsList(props: RestrictionsListProps) {
  const {
    activeTab,
    setActiveTab,
    hasPermission,
    gridApiRef,
    gamesGridApiRef,
    canDelete,
    getEndpoint,
    deleteEndpoint,
    canEditColumns = false,
    canDownloadCsv = false,
  } = props;

  const tabs = useMemo(
    () =>
      [
        hasPermission && {
          key: RestrictionType.PROVIDER,
          label: RESTRICTION_LABELS[RestrictionType.PROVIDER],
          content: gridApiRef ? (
            <RestrictedProviders
              canDelete={canDelete}
              gridApiRef={gridApiRef as React.MutableRefObject<GridApi | null>}
              getEndpoint={getEndpoint}
              deleteEndpoint={deleteEndpoint}
              canEditColumns={canEditColumns}
              canDownloadCsv={canDownloadCsv}
            />
          ) : null,
        },
        hasPermission && {
          key: RestrictionType.GAME,
          label: RESTRICTION_LABELS[RestrictionType.GAME],
          content: gamesGridApiRef ? (
            <RestrictedGames
              canDelete={canDelete}
              gridApiRef={gamesGridApiRef as React.MutableRefObject<GridApi | null>}
              getEndpoint={getEndpoint}
              deleteEndpoint={deleteEndpoint}
              canEditColumns={canEditColumns}
              canDownloadCsv={canDownloadCsv}
            />
          ) : null,
        },
      ].filter(Boolean) as {
        key: string;
        label: string;
        content: JSX.Element;
      }[],
    [
      hasPermission,
      canDelete,
      gridApiRef,
      gamesGridApiRef,
      getEndpoint,
      deleteEndpoint,
      canEditColumns,
      canDownloadCsv,
    ]
  );

  const handleTabChange = (key: string) => {
    setActiveTab(key);
  };
  return (
    <>
      <div className="flex flex-col w-full">
        <span className={`pb-4 text-xl font-extrabold text-gray-900`}>
          Restricted {RESTRICTION_LABELS[activeTab as RestrictionType]}s
        </span>
        <div className="w-full h-full flex flex-col -my-2 px-[10px] pb-28">
          <TabComponent
            tabs={tabs}
            activeTab={tabs.find((tab) => tab.key === activeTab)?.label || ''}
            onTabClick={(tab) => {
              const selectedTab = tabs.find((t) => t.label === tab.label);
              if (selectedTab) handleTabChange(selectedTab.key);
            }}
            buttonWidth="w-auto"
          />
          <div className="w-full mt-3 pt-3">
            {tabs.map(
              (tab) =>
                tab.key === activeTab && (
                  <div className="w-full flex flex-row flex-wrap xl:flex-wrap" key={tab.key}>
                    {tab.content}
                  </div>
                )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default RestrictionsList;
