import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { statusMapper } from 'utils/common/statusMapper';

const data = [
  { day: 'Monday', rake: 12385 },
  { day: 'Tuesday', rake: 12034 },
  { day: 'Wednesday', rake: 8500 },
  { day: 'Thursday', rake: 6400 },
  { day: 'Friday', rake: 4560 },
  { day: 'Saturday', rake: 2150 },
  { day: 'Sunday', rake: 1960 },
];

const DailyRakeChart = () => {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="p-6">
        <div className="flex items-center">
          <span className="text-base font-extrabold text-gray-900 pb-6">
            Daily Rake {statusMapper['inactive']}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={data} layout="vertical" margin={{ right: 40 }}>
            <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 13000]}
              ticks={[0, 2000, 4000, 6000, 8000, 10000, 12000]}
              tickFormatter={(value) => {
                if (value >= 12000) return '+12K';
                return `${value / 1000}K`;
              }}
              tick={{ fill: '#CECCE4', fontSize: 12, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="day"
              width={90}
              tick={{
                fill: '#4B5675',
                fontSize: 14,
                textAnchor: 'start',
                dx: -75,
                display: 'flex',
              }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              formatter={(value) => `€${value?.toLocaleString() ?? '0'}`}
              contentStyle={{
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                border: '1px solid #ddd',
              }}
            />
            <Bar
              dataKey="rake"
              fill="#70D49A"
              radius={[5, 5, 5, 5]}
              barSize={20}
              label={{
                position: 'right',
                formatter: (value: any) => `€${value?.toLocaleString() ?? '0'}`,
                fill: '#4B5675',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DailyRakeChart;
