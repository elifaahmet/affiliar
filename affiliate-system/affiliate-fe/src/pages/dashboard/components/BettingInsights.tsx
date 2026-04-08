import React, { useState } from 'react';
import TabComponent from '@components/core-components/tabs';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { statusMapper } from 'utils/common/statusMapper';

import Widget from '../../../components/common-components/widget/Widget';
interface Metric {
  title: string;
  value: any;
  change: string;
  changeType: string;
  color: string;
  icon?: string;
}

interface LineChartData {
  time: string;
  value: number;
}

interface BettingInsightsProps {
  metricsData: Metric[] | [];
  lineChartData: LineChartData[];
  footerValues: { [key: string]: number };
  classes?: string;
}

const BettingInsights: React.FC<BettingInsightsProps> = ({
  metricsData,
  lineChartData,
  footerValues,
  classes = '',
}) => {
  const tabColors = {
    'Single Bets': 'bg-purple',
    'Multi Bets': 'bg-orange',
    'System Bets': 'bg-success',
    'Chain Bets': 'bg-yellow',
  };
  const [activeTab, setActiveTab] = useState<keyof typeof tabColors>('Single Bets');
  const tabs = [
    { label: 'Single Bets', statusName: 'inactive' },
    { label: 'Multi Bets', statusName: 'inactive' },
    { label: 'System Bets', statusName: 'inactive' },
    { label: 'Chain Bets', statusName: 'inactive' },
  ];
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className={`px-5 py-6 flex flex-col ${classes}`}>
        <div className="mb-5">
          <div className="flex flex-row justify-between items-center">
            <span className="text-base font-extrabold text-gray-900 pb-6">
              Betting Insights {statusMapper['inactive']}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metricsData.map((metric, index) => (
              <Widget
                key={index}
                title={metric.title}
                value={metric.value}
                change={metric.change}
                changeType={metric.changeType}
                backgroundColor={metric.color}
                height="h-[74px]"
                icon={metric.icon}
              />
            ))}
          </div>
        </div>

        <TabComponent
          tabs={tabs}
          activeTab={activeTab}
          onTabClick={(tab) => setActiveTab(tab.label as keyof typeof tabColors)}
          buttonWidth="w-full"
          type="withBackground"
        />

        {/* Line Chart */}
        <div className="h-56 mt-6">
          <ResponsiveContainer>
            <AreaChart data={lineChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="16%" stopColor="rgba(69, 169, 239, 0.30)" />
                  <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: '#CECCE4', fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                padding={{ left: 10, right: 10 }}
                ticks={['09:00', '12:00', '15:00', '18:00', '21:00']}
              />
              <YAxis hide />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#1B84FF" strokeWidth={3} dot={false} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#1B84FF"
                strokeWidth={3}
                fill="url(#colorUv)"
                fillOpacity={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex w-full justify-between items-center mt-4 p-6 border border-dashed border-borderColor rounded-[10px] text-base font-extrabold text-gray-900">
          <div className="flex items-center gap-4">
            <div className={`w-1 h-6 rounded-lg ${tabColors[activeTab]}`}></div>
            <span>{activeTab}</span>
          </div>
          <span className="text-xl">{footerValues[activeTab]}</span>
        </div>
      </div>
    </div>
  );
};

export default BettingInsights;
