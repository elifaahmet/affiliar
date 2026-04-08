import React from 'react';
import Icon from '@components/core-components/icon';
import { statusMapper } from 'utils/common/statusMapper';

const profitData = [
  {
    name: 'Bet Sport',
    value: '€2.385,00',
    change: 'up',
    color: 'bg-primary',
  },
  {
    name: 'Win Sport',
    value: '€1.768,00',
    change: 'down',
    color: 'bg-danger',
  },
  {
    name: 'Bet Casino',
    value: '€0,00',
    change: 'neutral',
    color: 'bg-success',
  },
  {
    name: 'Win Casino',
    value: '€3,490,00',
    change: 'up',
    color: 'bg-yellow',
  },
  { name: 'Rake', value: '€763,00', change: 'down', color: 'bg-purple' },
  { name: 'Bonus', value: '€2,000,00', change: 'up', color: 'bg-cyan' },
  {
    name: 'Tournament Cost',
    value: '€8,500,00',
    change: 'up',
    color: 'bg-dark',
  },
];

const ProfitTable = () => {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        <div className="flex flex-row justify-between items-center pb-4 border-b border-dashed border-borderColor">
          <span className="text-base font-extrabold text-gray-900">
            Profit {statusMapper['inactive']}
          </span>
        </div>
        <ul className="p-0 pt-1">
          {profitData.map((item, index) => (
            <li
              key={index}
              className={`flex justify-between items-center ${
                index !== profitData.length - 1 ? 'border-b border-dashed border-gray-300' : ''
              } ${index === profitData.length - 1 ? 'pt-4' : 'py-4'}`}
            >
              <div className="flex items-center">
                <span className={`w-[10px] h-[10px] rounded-lg ${item.color}`}></span>
                <span className="text-sm font-medium text-gray-700 pl-4">{item.name}</span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`pr-3 font-bold text-sm ${
                    item.change === 'up'
                      ? 'text-success'
                      : item.change === 'down'
                        ? 'text-danger'
                        : 'text-gray-900'
                  }`}
                >
                  {item.value}
                </span>
                {item.change === 'up' ? (
                  <Icon iconName="greenUp" svgProps={{ width: 18, height: 18 }} />
                ) : item.change === 'down' ? (
                  <Icon iconName="redDown" svgProps={{ width: 18, height: 18 }} />
                ) : (
                  <div style={{ width: 18, height: 18 }}></div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ProfitTable;
