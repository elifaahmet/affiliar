import React from 'react';
import { getBrandingConfig } from 'config/brandConfig';
import { Cell, Pie, PieChart } from 'recharts';
import { statusMapper } from 'utils/common/statusMapper';

interface DataItem {
  name: string;
  value: number;
  color: string;
  statusName?: string;
  [key: string]: unknown; // ✅ recharts
}

interface FinancialBreakdownProps {
  data: DataItem[];
  title?: string;
}

const FinancialBreakdown: React.FC<FinancialBreakdownProps> = ({ data, title = 'Total' }) => {
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const totalItems = data.length;

  const {
    config: { features },
  } = getBrandingConfig();

  if (features?.hideNonFunctional) {
    return null;
  }

  return (
    <div className="flex items-center justify-start w-full min-w-[450px] h-full bg-white rounded-lg p-4 border border-[#F1F1F4] border-solid shadow-[0px_3px_4px_0px_rgba(0,0,0,0.03)]">
      <div className="relative w-[109px] h-[109px] flex items-center justify-center">
        <PieChart width={109} height={109}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={55}
            fill="#8884d8"
            dataKey="value"
            label={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[18px] font-bold text-gray-800">{totalItems}</span>
          <span className="text-body-reg-14 text-gray-600">{title}</span>
        </div>
      </div>

      <div className="ml-4 w-full">
        {data.map((entry, index) => {
          return (
            <div key={index} className="flex items-center gap-2 mb-2 justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-[20px] h-[4px] rounded-lg"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 text-sm font-bold">
                  {entry.name} ({((entry.value / totalValue) * 100).toFixed(0)}
                  %) {entry.statusName && statusMapper[entry.statusName]}
                </span>
              </div>
              <span className="text-heading-18 font-extrabold text-gray-700">{`€${entry.value?.toLocaleString() ?? '0'}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FinancialBreakdown;
