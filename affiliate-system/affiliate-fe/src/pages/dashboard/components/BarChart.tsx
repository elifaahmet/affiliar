import React, { useState } from 'react';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { statusMapper } from 'utils/common/statusMapper';

const initialData = [
  { time: '08:00', bets: 80 },
  { time: '09:00', bets: 1000 },
  { time: '10:00', bets: 100 },
  { time: '11:00', bets: 100 },
  { time: '12:00', bets: 2500 },
  { time: '13:00', bets: 3500 },
  { time: '14:00', bets: 5500 },
  { time: '15:00', bets: 200 },
  { time: '16:00', bets: 10500 },
  { time: '17:00', bets: 4000 },
  { time: '18:00', bets: 90 },
  { time: '19:00', bets: 50 },
  { time: '08:00', bets: 75 },
];

const PlacedBetsChart = () => {
  const [filter, setFilter] = useState('All Bets');

  const filteredData = filter === 'All Bets' ? initialData : initialData.slice(0, 6);

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        <div className="flex flex-row justify-between items-center">
          <span className="text-base font-extrabold text-gray-900 pb-6">
            Placed Bets {statusMapper['inactive']}
          </span>
          <BSelectWithSearch
            label="Select Bet Time"
            options={[
              { value: 'All Bets', label: 'All Bets' },
              { value: 'Morning', label: 'Morning' },
              { value: 'Afternoon', label: 'Afternoon' },
            ]}
            value={filter}
            onChange={setFilter}
            showSearch={false}
            classname="h-full w-[237px]"
          />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart barGap={30} data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12, fill: '#CECCE4', fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              width={100}
              interval={0}
            />

            <YAxis
              type="number"
              scale="log"
              tickCount={7}
              domain={[10, 50000]}
              ticks={[10, 100, 1000, 10000, 50000]}
              tick={{
                fontSize: 12,
                fill: '#CECCE4',
                fontWeight: 700,
              }}
              tickFormatter={(value) => {
                if (value >= 1000) return `${value / 1000}K`;
                return value;
              }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #ddd',
              }}
            />
            <Bar barSize={20} dataKey="bets" fill="#1B84FF" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PlacedBetsChart;
