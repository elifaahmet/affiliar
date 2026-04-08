import React from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import Icon from '@components/core-components/icon';

import ActivityCard from '../components/ActivityCard';
import BarChartComponent from '../components/BarChart';
import BettingInsights from '../components/BettingInsights';
import DepositWithdrawCard from '../components/DepositWithdrawCard';
import DailyRakeChart from '../components/GreenChart';
import LiveStatisticsByCountry from '../components/LiveStatsCountry';
import CasinoOverview from '../components/Overview';
import PokerOverview from '../components/PokerOverView';
import PopularSports from '../components/PopularSports';
import SportsbookOverview from '../components/SportBookOverview';
import ProfitTable from '../components/TableDate';

import Top5Games from './Top5Games';
import Top5Providers from './Top5Providers';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface WidgetGridProps {
  layout: Layout[];
  setLayout?: (layout: Layout[]) => void;
  windowWidth: number;
  editable?: boolean;
  hiddenWidgets?: Set<string>;
}

// FOR A QUICK GLANCE DATA
const activityCardData = [
  {
    id: 1,
    title: 'All-Time Deposits',
    amount: '€1.490.00,00',
    icon: 'emptyWalletAdd',
    bgColor: 'bg-success-gradient',
  },
  {
    id: 2,
    title: 'All-Time Withdrawals',
    amount: '€142.500,00',
    icon: 'withdraw',
    bgColor: 'bg-danger-gradient',
  },
  {
    id: 3,
    title: 'Of Player Deposited',
    amount: '82.14%',
    icon: 'playerCircle',
    bgColor: 'bg-primary-gradient',
  },
  {
    id: 4,
    title: 'Of Players Withdrew',
    amount: '17.86%',
    icon: 'playerCircle',
    bgColor: 'bg-orange-gradient',
  },
];
// DEPOSIT & WITHDRAW DATA
const paymentAcitivitesData = [
  {
    id: 1,
    title: 'Highest Deposit',
    amount: '€5.000,00',
    icon: 'emptyWalletAdd',
    bgColor: 'bg-success-gradient',
  },
  {
    id: 2,
    title: 'Deposits: Players Ratio',
    amount: '82.14%',
    icon: 'playerCircle',
    bgColor: 'bg-primary-gradient',
  },
  {
    id: 3,
    title: 'Highest Withdrawal',
    amount: '€3.250,00',
    icon: 'withdraw',
    bgColor: 'bg-danger-gradient',
  },
  {
    id: 4,
    title: 'Withdrawals: Player Ratio',
    amount: '17.86%',
    icon: 'playerCircle',
    bgColor: 'bg-orange-gradient',
  },
];
// BETTING INSIGHTS DATA
const metricsData = [
  {
    title: 'Bets',
    value: '1,652',
    change: '36%',
    changeType: 'positive',
    color: 'bg-primary',
  },
  {
    title: 'Settors',
    value: '954',
    change: '36%',
    changeType: 'positive',
    color: 'bg-orange',
  },
  {
    title: 'Average Stake',
    value: '€3,250,00',
    change: '36%',
    changeType: 'positive',
    color: 'bg-success',
  },
];
const lineChartData = [
  { time: '09:00', value: 500 },
  { time: '09:15', value: 470 },
  { time: '09:30', value: 420 },
  { time: '09:45', value: 400 },

  { time: '10:00', value: 430 },
  { time: '10:15', value: 440 },
  { time: '10:30', value: 460 },
  { time: '10:45', value: 450 },

  { time: '11:00', value: 480 },
  { time: '11:15', value: 510 },
  { time: '11:30', value: 540 },
  { time: '11:45', value: 600 },

  { time: '12:00', value: 580 },
  { time: '12:15', value: 550 },
  { time: '12:30', value: 500 },
  { time: '12:45', value: 470 },

  { time: '13:00', value: 430 },
  { time: '13:15', value: 390 },
  { time: '13:30', value: 370 },
  { time: '13:45', value: 350 },

  { time: '14:00', value: 330 },
  { time: '14:15', value: 310 },
  { time: '14:30', value: 290 },
  { time: '14:45', value: 270 },

  { time: '15:00', value: 250 },
  { time: '15:15', value: 230 },
  { time: '15:30', value: 240 },
  { time: '15:45', value: 260 },

  { time: '16:00', value: 280 },
  { time: '16:15', value: 300 },
  { time: '16:30', value: 330 },
  { time: '16:45', value: 360 },

  { time: '17:00', value: 390 },
  { time: '17:15', value: 420 },
  { time: '17:30', value: 430 },
  { time: '17:45', value: 440 },

  { time: '18:00', value: 400 },
  { time: '18:15', value: 370 },
  { time: '18:30', value: 340 },
  { time: '18:45', value: 310 },

  { time: '19:00', value: 280 },
  { time: '19:15', value: 250 },
  { time: '19:30', value: 220 },
  { time: '19:45', value: 200 },

  { time: '20:00', value: 240 },
  { time: '20:15', value: 270 },
  { time: '20:30', value: 300 },
  { time: '20:45', value: 350 },

  { time: '21:00', value: 400 },
];
const footerValues = {
  'Single Bets': 954,
  'Multi Bets': 1234,
  'System Bets': 567,
  'Chain Bets': 890,
};
// CASINO INSIGHTS DATA
/* const pieData = [
  { name: 'Live Casino', value: 54, change: 'up', amount: '€1,740,00' },
  { name: 'Slots', value: 26, change: 'down', amount: '€690,00' },
  { name: 'Crush Games', value: 20, change: 'up', amount: '€185,00' },
];
const COLORS = ['#17C653', '#FF7A00', '#7239EA']; */

const WidgetGrid: React.FC<WidgetGridProps> = ({
  layout,
  setLayout,
  windowWidth,
  editable = false,
  hiddenWidgets,
}) => {
  const filteredLayout = React.useMemo(() => {
    if (!hiddenWidgets || hiddenWidgets.size === 0) {
      return layout;
    }
    return layout.filter((item: Layout) => !hiddenWidgets.has(item.i));
  }, [layout, hiddenWidgets]);

  const handleRemoveItem = (key: string) => {
    if (setLayout) {
      const updatedLayout = filteredLayout.filter((item: Layout) => item.i !== key);
      setLayout(updatedLayout);
    }
  };
  const renderComponent = (key: string) => {
    switch (key) {
      case 'liveStats':
        return <LiveStatisticsByCountry />;
      case 'top5Providers':
        return <Top5Providers />;
      case 'top5Games':
        return <Top5Games />;
      case 'profitTable':
        return <ProfitTable />;
      case 'bettingInsights':
        return (
          <BettingInsights
            metricsData={metricsData}
            lineChartData={lineChartData}
            footerValues={footerValues}
          />
        );
      case 'sportsbookOverview':
        return <SportsbookOverview />;
      case 'dailyRakeChart':
        return <DailyRakeChart />;
      case 'barChart':
        return <BarChartComponent />;
      case 'popularSports':
        return <PopularSports />;
      case 'casinoOverview':
        return <CasinoOverview />;
      case 'pokerOverview':
        return <PokerOverview />;
      /* case 'pieChart':
        return <PieChartComponent title="Casino insights" pieData={pieData} colors={COLORS} />; */
      case 'activityCard1':
        return <ActivityCard title="For A Quick Glance" data={activityCardData} />;
      case 'activityCard2':
        return <ActivityCard title="Payment Activities" data={paymentAcitivitesData} />;
      case 'depositWithdrawCard':
        return <DepositWithdrawCard />;
      default:
        return null;
    }
  };

  return (
    <GridLayout
      className="layout"
      layout={filteredLayout}
      cols={12}
      rowHeight={50}
      width={windowWidth}
      isDraggable={editable}
      isResizable={editable}
      onLayoutChange={editable && setLayout ? setLayout : undefined}
      compactType="vertical"
      resizeHandles={['se']}
      draggableHandle=".drag-handle"
    >
      {filteredLayout.map((item) => (
        <div key={item.i} data-grid={item} className="relative">
          {editable && (
            <div className="absolute gap-3 p-3 top-3 right-3 m-1 flex items-center justify-center bg-gray-700 text-white text-xs rounded z-50">
              <button
                className="w-8 h-8 flex items-center justify-center bg-white text-gray-900 text-xs rounded z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(item.i);
                }}
              >
                <Icon iconName="trashCan" className="w-5 h-5" />
              </button>
              <button className="w-8 h-8 flex drag-handle items-center justify-center bg-white text-gray-900 text-xs rounded z-50">
                <Icon iconName="move" className="w-5 h-5 mt-3" />
              </button>
            </div>
          )}
          {renderComponent(item.i)}
        </div>
      ))}
    </GridLayout>
  );
};

export default WidgetGrid;
