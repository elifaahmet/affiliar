import React from 'react';
import Icon from '@components/core-components/icon';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { statusMapper } from 'utils/common/statusMapper';

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      dominantBaseline="central"
      textAnchor="middle"
      alignmentBaseline="middle"
      fontSize={14}
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

interface PieChartComponentProps {
  pieData: { name: string; value: number; change: string; amount: string }[];
  colors: string[];
  title: string;
}

const PieChartComponent: React.FC<PieChartComponentProps> = ({ pieData, colors, title }) => {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="px-5 py-6">
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold text-gray-900">
            {title} {statusMapper['inactive']}
          </span>
        </div>
        <div className="flex items-start justify-between">
          <ul className="flex flex-col w-full pt-5">
            {pieData.map((item, index) => (
              <li
                key={index}
                className={`flex items-center py-4 border-t border-[#F1F1F4] last:border-b`}
              >
                <div className="flex justify-between items-center w-full text-sm font-medium text-gray-800">
                  <div className="flex flex-row items-center justify-start gap-2 w-28">
                    <div
                      className={`w-2 h-2 rounded-full`}
                      style={{ backgroundColor: colors[index] }}
                    ></div>
                    <span>{item.name}</span>
                  </div>
                  <span className="font-bold">{item.amount}</span>
                  <div className="flex items-center">
                    {item.change === 'up' ? (
                      <Icon iconName="greenUp" svgProps={{ width: 21, height: 21 }} />
                    ) : (
                      <Icon iconName="redDown" svgProps={{ width: 21, height: 21 }} />
                    )}
                    <span
                      className={`text-sm font-bold ml-1 ${
                        item.change === 'up' ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {item.value}%
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="w-full max-w-60 h-[200px] flex items-center justify-center">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={0}
                  cornerRadius={2}
                  stroke="white"
                  strokeWidth={4}
                  label={renderCustomizedLabel}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index]}
                      className="cursor-default focus:outline-none focus:ring-0 active:ring-0 ring-0"
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value}%`, `${name}`]}
                  contentStyle={{
                    position: 'absolute',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PieChartComponent;
