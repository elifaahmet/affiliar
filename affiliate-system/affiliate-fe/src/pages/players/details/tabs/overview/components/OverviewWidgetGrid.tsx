import React from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import PieChartComponent from '@components/common-components/pieChart';
import Icon from '@components/core-components/icon';
import ActivityCard from 'pages/dashboard/components/ActivityCard';
import BarChartComponent from 'pages/dashboard/components/BarChart';
import BettingInsights from 'pages/dashboard/components/BettingInsights';
import DepositWithdrawCard from 'pages/dashboard/components/DepositWithdrawCard';
import DailyRakeChart from 'pages/dashboard/components/GreenChart';
import CasinoOverview from 'pages/dashboard/components/Overview';
import PokerOverview from 'pages/dashboard/components/PokerOverView';
import PopularSports from 'pages/dashboard/components/PopularSports';
import SportsbookOverview from 'pages/dashboard/components/SportBookOverview';
import ProfitTable from 'pages/dashboard/components/TableDate';
import Top5Games from 'pages/dashboard/components/Top5Games';
import Top5Providers from 'pages/dashboard/components/Top5Providers';

import FinancialInsights from './FinancialInsights';
import PlayerActivities from './PlayerActivities';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface OverviewWidgetGridProps {
  layout: Layout[];
  setLayout?: (layout: Layout[]) => void;
  windowWidth: number;
  editable?: boolean;
}

const tableData = [
  {
    type: 'Turnover',
    preMatch: { value: '€ 50,00', change: 'neutral' },
    live: { value: '€ 1.614,74', change: 'neutral' },
    mixed: { value: '€ 1.614,74', change: 'neutral' },
    total: { value: '€ 1.614,74', change: 'neutral' },
    color: 'bg-primary',
  },
  {
    type: 'Player Wins',
    preMatch: { value: '€ 651,92', change: 'neutral' },
    live: { value: '€ 607,04', change: 'neutral' },
    mixed: { value: '€ 607,04', change: 'neutral' },
    total: { value: '€ 607,04', change: 'neutral' },
    color: 'bg-danger',
  },
  {
    type: 'Player returns',
    preMatch: { value: '€ 50,92', change: 'neutral' },
    live: { value: '€ 411,92', change: 'neutral' },
    mixed: { value: '€ 411,92', change: 'neutral' },
    total: { value: '€ 411,92', change: 'neutral' },
    color: 'bg-success',
  },
  {
    type: 'Bets count',
    preMatch: { value: '1', change: 'neutral' },
    live: { value: '14', change: 'neutral' },
    mixed: { value: '14', change: 'neutral' },
    total: { value: '14', change: 'neutral' },
    color: 'bg-darkGreen',
  },
  {
    type: 'Open bets',
    preMatch: { value: '2', change: 'neutral' },
    live: { value: '2', change: 'neutral' },
    mixed: { value: '2', change: 'neutral' },
    total: { value: '2', change: 'neutral' },
    color: 'bg-danger-dark',
  },
  {
    type: 'GGR',
    preMatch: { value: '€ 1.763,00', change: 'negative' },
    live: { value: '€ 3.490,00', change: 'positive' },
    mixed: { value: '€ 33.86,00', change: 'positive' },
    total: { value: '€ 33.86,00', change: 'positive' },
    color: 'bg-yellow',
  },
];

const metricsData = [
  {
    title: 'Bets',
    value: '12',
    change: '36%',
    changeType: 'positive',
    color: 'bg-primary',
  },
  {
    title: 'Lost',
    value: '23',
    change: '36%',
    changeType: 'positive',
    color: 'bg-danger',
  },
  {
    title: 'Won',
    value: '213',
    change: '36%',
    changeType: 'positive',
    color: 'bg-success',
  },
  {
    title: 'Open',
    value: '3120',
    change: '36%',
    changeType: 'positive',
    color: 'bg-purple',
  },
  {
    title: 'Return',
    value: '123',
    change: '36%',
    changeType: 'positive',
    color: 'bg-orange',
  },
  {
    title: 'Average stake',
    value: '€ 123,00',
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

const pieData = [
  { name: 'Sportsbook', value: 54, change: 'up', amount: '€1,740,00' },
  { name: 'Casino', value: 26, change: 'down', amount: '€690,00' },
  { name: 'Exchange', value: 20, change: 'up', amount: '€185,00' },
];

const COLORS = ['#8B5CF6', '#F57A34', '#B66FED'];
const headers = ['TYPE', 'Pre-match', 'Live', 'Mixed', 'Total'];

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

const OverviewWidgetGrid: React.FC<OverviewWidgetGridProps> = ({
  layout,
  setLayout,
  windowWidth,
  editable = false,
}) => {
  const handleRemoveItem = (key: string) => {
    if (setLayout) {
      const updatedLayout = layout.filter((item: Layout) => item.i !== key);
      setLayout(updatedLayout);
    }
  };
  const renderComponent = (key: string) => {
    switch (key) {
      case 'bettingInsights':
        return (
          <BettingInsights
            metricsData={metricsData}
            lineChartData={lineChartData}
            footerValues={footerValues}
          />
        );
      case 'financialInsights':
        return <FinancialInsights tableData={tableData} headers={headers} />;
      case 'pieChart':
        return <PieChartComponent title="Game Insights" pieData={pieData} colors={COLORS} />;
      case 'playerActivities':
        return <PlayerActivities />;
      case 'profitTable':
        return <ProfitTable />;
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
      case 'top5Providers':
        return <Top5Providers />;
      case 'top5Games':
        return <Top5Games />;
      case 'pokerOverview':
        return <PokerOverview />;
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
      layout={layout}
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
      {layout.map((item) => (
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

export default OverviewWidgetGrid;
