import React from 'react';
import TableComponent from '@components/common-components/table';
import { statusMapper } from 'utils/common/statusMapper';

const tableData = [
  {
    type: 'Turnover',
    preMatch: { value: '€50,00', change: 'neutral' },
    live: { value: '€1.614,74', change: 'neutral' },
    total: { value: '€1.614,74', change: 'neutral' },
    color: 'bg-primary',
  },
  {
    type: 'Winning',
    preMatch: { value: '€651,92', change: 'neutral' },
    live: { value: '€607,04', change: 'neutral' },
    total: { value: '€1.168,96', change: 'neutral' },
    color: 'bg-danger',
  },
  {
    type: 'Win/Loss',
    preMatch: { value: '€ 50,92', change: 'neutral' },
    live: { value: '€1.614,74', change: 'neutral' },
    total: { value: '€1.664,74', change: 'neutral' },
    color: 'bg-success',
  },
  {
    type: 'Rake',
    preMatch: { value: '€50', change: 'neutral' },
    live: { value: '€59.81', change: 'neutral' },
    total: { value: '€59,46', change: 'neutral' },
    color: 'bg-yellow',
  },
  {
    type: 'Number of players',
    preMatch: { value: '1', change: 'neutral' },
    live: { value: '2', change: 'neutral' },
    total: { value: '2', change: 'neutral' },
    color: 'bg-dark',
  },
];
const headers = ['TYPE', 'Cash', 'Tournament', 'Total'];

const PokerOverview = () => {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold text-gray-900 pb-6">
            Poker Overview {statusMapper['inactive']}
          </span>
        </div>
        <TableComponent headers={headers} data={tableData} />
      </div>
    </div>
  );
};

export default PokerOverview;
