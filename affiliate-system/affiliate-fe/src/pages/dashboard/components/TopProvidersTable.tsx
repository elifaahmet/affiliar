import React from 'react';

import { Top5ProvidersType } from './Top5Providers';

interface TopProvidersTableProps {
  data?: Top5ProvidersType;
  label?: string;
  profit: boolean;
  maxAbsGGR: number;
}

function TopProvidersTable(props: TopProvidersTableProps) {
  const { data, label, maxAbsGGR } = props;
  const safeMaxAbsGGR = maxAbsGGR || 1;
  return (
    <>
      <div className="border border-gray-300">
        <h4 className="bg-[#EEF2F4] py-2 px-3 text-sm font-bold text-[#78829D]">{label}</h4>
        {data?.providers && data.providers.length > 0 ? (
          React.Children.toArray(
            data?.providers?.map((item) => {
              const isPositive = item.total >= 0;
              const barBg = isPositive ? 'bg-success-light' : 'bg-danger-light';
              const barFg = isPositive ? 'bg-success' : 'bg-danger';
              const textColor = isPositive ? 'text-success' : 'text-danger';
              return (
                <div className="py-[18px] px-3 border-b border-gray-300 last:border-0 flex items-center gap-2 w-100">
                  <h5 className="text-gray-900 text-sm font-bold min-w-[180px] truncate w-4/10">
                    {item.rank}. {item.provider}
                  </h5>
                  <div className="flex w-1/2">
                    <div
                      className={`relative overflow-hidden ${barBg} h-[18px] rounded-full w-full`}
                    >
                      <div
                        className={`absolute ${barFg} left-0 h-full rounded-full flex gap-1 text-white items-center px-[10px] text-sm font-bold`}
                        style={{
                          width: `${Math.min(100, (Math.abs(item.total) / safeMaxAbsGGR) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 w-1/5">
                    <span className={`text-right tabular-nums ${textColor}`}>
                      {data.currency.symbol}
                      {item.total}
                    </span>
                  </div>
                </div>
              );
            })
          )
        ) : (
          <div className="py-4 px-3 text-center text-sm text-gray-700">No data available</div>
        )}
      </div>
    </>
  );
}

export default TopProvidersTable;
