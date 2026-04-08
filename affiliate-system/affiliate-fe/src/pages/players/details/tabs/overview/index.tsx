import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import KeyPerformanceIndicators from '@components/common-components/keyPerformanceIndicators';
import DateRangePicker from '@components/core-components/datePicker/DateRangePicker';
import TabObjectComponent from '@components/core-components/tabs-object';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { getPlayerHiddenParts } from 'config/brandConfig';
import { useAppSelector } from 'hooks/redux';
import { API_BASE_URL } from 'utils/api/apiConfig';
import { subscribePlayerDashboard } from 'utils/managers/wsManager';

import OverviewWidgetGrid from './components/OverviewWidgetGrid';
import { tabsData } from './data';

interface TabOption {
  label: string;
  value: {
    startDate: Date;
    endDate: Date;
  };
}

function Overview() {
  const getInitialLayout = () => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('overview-layout') : null;

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultLayout;
      }
    }
    return defaultLayout;
  };
  const playerHiddenParts = getPlayerHiddenParts();
  const defaultLayout = React.useMemo(
    () => [
      {
        i: 'bettingInsights',
        x: 0,
        y: 7.5,
        w: 5.5,
        h: 11.5,
        minW: 4,
        minH: 8,
      },
      {
        i: 'financialInsights',
        x: 5.7,
        y: 7.5,
        w: 6,
        h: 7,
        minW: 6,
        minH: 7,
      },
      { i: 'pieChart', x: 5.7, y: 32, w: 6, h: 4.5, minW: 5, minH: 4 },
      {
        i: 'playerActivities',
        x: 0,
        y: 64,
        w: 11.7,
        h: 7.5,
        minW: 6,
        minH: 2.5,
      },
    ],
    []
  );

  const navigate = useNavigate();
  const [layout, setLayout] = useState<any[]>(getInitialLayout());
  const [activeTab, setActiveTab] = React.useState(tabsData[1]);
  const [windowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1920);
  const generateKPIData = (latest: any) => {
    const toNumber = (value: unknown) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };
    const format = (v: unknown) => `€${toNumber(v).toLocaleString()}`;
    return [
      {
        id: 1,
        title: 'Total of deposits',
        value: format(latest?.total_deposits ?? 0),
        icon: 'emptyWalletAdd',
        backgroundColor: 'bg-success-gradient',
        show: true,
      },
      {
        id: 2,
        title: 'Total of withdrawals',
        value: format(latest?.total_withdrawals ?? 0),
        icon: 'withdraw',
        backgroundColor: 'bg-danger-gradient',
        show: true,
      },

      {
        id: 3,
        title: 'Deposit count',
        value: `${latest?.deposits_count ?? 0}`,
        icon: 'cardDeposit',
        backgroundColor: 'bg-warning-gradient',
        show: true,
      },
      {
        id: 4,
        title: 'Withdrawals count',
        value: `${latest?.withdrawals_count ?? 0}`,
        icon: 'cardDeposit',
        backgroundColor: 'bg-warning-gradient',
        show: true,
      },
    ];
  };
  const [widgetData, setWidgetData] = React.useState<any[]>(generateKPIData({}));
  const today = new Date();
  const [dateRange, setDateRange] = React.useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({
    startDate: new Date(today.setDate(today.getDate() - 1)),
    endDate: new Date(today),
  });
  const defaultWidgetRef = useRef<any[]>(generateKPIData({}));
  const { id } = useParams();
  const start = dateRange?.startDate?.toISOString().split('T')[0];
  const end = dateRange?.endDate?.toISOString().split('T')[0];
  const player = useAppSelector((state) => state.sharedData.player);

  const endpoint =
    start && end
      ? activeTab.label === tabsData[6].label
        ? `${API_BASE_URL}api/dashboard/player/lmtd-data?playerId=${id}&start=${start}&end=${end}`
        : `${API_BASE_URL}api/dashboard/player/range?playerId=${id}&start=${start}&end=${end}`
      : '';

  const { data } = useBaseQuery<any>({
    endpoint,
    queryKey: [dateRange],
    enabled: !!start && !!end,
  });
  const isEqual = (a: any[], b: any[]) => JSON.stringify(a) === JSON.stringify(b);
  useEffect(() => {
    if (activeTab.label !== tabsData[0].label || !player?._id) return;

    const unsubscribe = subscribePlayerDashboard(player._id, (data) => {
      const payload = data?.data ?? data;
      const updatedData = generateKPIData(payload);

      const patchedData = mergeWidgetData(defaultWidgetRef.current, updatedData);
      defaultWidgetRef.current = patchedData;
      setWidgetData(patchedData);
    });

    return () => unsubscribe();
  }, [activeTab.label, player?._id, id]);

  useEffect(() => {
    if (!data?.success || !data?.data) return;

    const latest = data.data;
    const newData = generateKPIData(latest);
    defaultWidgetRef.current = mergeWidgetData(defaultWidgetRef.current, newData);
    setWidgetData((prev) => {
      const mergedData = mergeWidgetData(prev, newData);
      return isEqual(prev, mergedData) ? prev : mergedData;
    });
  }, [data]);

  useEffect(() => {
    const saved = localStorage.getItem('overview-layout');
    if (saved) {
      setLayout(JSON.parse(saved));
    }

    const handleStorage = () => {
      const newSaved = localStorage.getItem('overview-layout');
      if (newSaved) {
        setLayout(JSON.parse(newSaved));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const mergeWidgetData = (existing: any[], updates: any[]): any[] => {
    const updateMap = new Map<number, any>(updates.map((u) => [u.id, u]));

    return existing.map((widget) => {
      const incoming = updateMap.get(widget.id);
      if (!incoming || incoming.value === undefined) return widget;

      return {
        ...widget,
        value: incoming.value,
        show: incoming.show,
      };
    });
  };
  const handleClick = (item: TabOption) => {
    setActiveTab(item);
    setDateRange(item.value);
  };

  return (
    <div className="flex flex-col w-full gap-4 min-h-[1700px]">
      <div className="flex flex-row justify-between items-center gap-6 -mt-1 px-[10px]">
        <TabObjectComponent
          tabs={tabsData}
          activeTab={activeTab}
          onTabClick={handleClick}
          type="withBackground"
        />
        <div className="flex w-[220px]">
          <DateRangePicker
            value={[dateRange.startDate, dateRange.endDate]}
            setValue={(date) =>
              setDateRange({
                startDate: date[0],
                endDate: date[1],
              })
            }
            changeActiveTab={(item: TabOption) => setActiveTab(item || tabsData[6])}
            labelsData={tabsData}
            position={'left'}
            isSingleDateView={
              activeTab.label === tabsData[0].label || activeTab.label === tabsData[1].label
            }
          />
        </div>
      </div>
      <div className="h-[1px] w-full bg-gray-300"></div>
      <span className="text-heading-20 font-extrabold text-gray-900">
        Key Performance Indicators
      </span>

      {defaultWidgetRef?.current?.length > 0 && (
        <KeyPerformanceIndicators
          defaultWidgetData={defaultWidgetRef.current}
          widgetData={widgetData}
          onChange={(data) => setWidgetData(data)}
          activeTab={activeTab.label}
        />
      )}
      {layout.filter((item) => !playerHiddenParts.includes(item.i))?.length > 0 && (
        <>
          <div className="flex flex-row justify-between items-center pt-4">
            <span className="text-2xl font-extrabold text-gray-900">PLAYER&#39;S WIDGETS</span>
            <button
              className="flex flex-row underline"
              onClick={() => navigate(`/players/list/detail/overview-edit-widgets`)}
            >
              <span className="text-sm font-bold text-gray-700 hover:text-gray-800">
                Edit Widget Layouts
              </span>
            </button>
          </div>
          <OverviewWidgetGrid
            layout={layout.filter((item) => !playerHiddenParts.includes(item.i))}
            setLayout={setLayout}
            windowWidth={windowWidth - 170}
          />
        </>
      )}
    </div>
  );
}

export default Overview;
