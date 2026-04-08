import React from 'react';
import TableComponent from '@components/common-components/table';
import { statusMapper } from 'utils/common/statusMapper';

const tableData = [
  {
    type: 'Turnover',
    preMatch: { value: '€ 50,00', change: 'neutral' },
    live: { value: '€ 1.614,74', change: 'neutral' },
    total: { value: '€ 1.614,74', change: 'neutral' },
    color: 'bg-primary',
  },
  {
    type: 'Winning',
    preMatch: { value: '€ 651,92', change: 'neutral' },
    live: { value: '€ 607,04', change: 'neutral' },
    total: { value: '€ 607,04', change: 'neutral' },
    color: 'bg-danger',
  },
  {
    type: 'Open bets',
    preMatch: { value: '€ 50,92', change: 'neutral' },
    live: { value: '€ 411,92', change: 'neutral' },
    total: { value: '€ 411,92', change: 'neutral' },
    color: 'bg-success',
  },
  {
    type: 'GGR',
    preMatch: { value: '€ 1.763,00', change: 'negative' },
    live: { value: '€ 3.490,00', change: 'positive' },
    total: { value: '€ 33.86,00', change: 'negative' },
    color: 'bg-yellow',
  },
  {
    type: 'Profitability',
    preMatch: { value: '50.72%', change: 'positive' },
    live: { value: '36.90%', change: 'positive' },
    total: { value: '2.03%', change: 'positive' },
    color: 'bg-purple',
  },
  {
    type: 'Number of bets',
    preMatch: { value: '1', change: 'neutral' },
    live: { value: '27', change: 'neutral' },
    total: { value: '27', change: 'neutral' },
    color: 'bg-cyan',
  },
  {
    type: 'Average bet',
    preMatch: { value: '€ 50,92', change: 'neutral' },
    live: { value: '€ 59,81', change: 'neutral' },
    total: { value: '€ 59,81', change: 'neutral' },
    color: 'bg-orange',
  },
  {
    type: 'Bet per player',
    preMatch: { value: '1', change: 'neutral' },
    live: { value: '14', change: 'neutral' },
    total: { value: '14', change: 'neutral' },
    color: 'bg-darkGreen',
  },
  {
    type: 'Number of players',
    preMatch: { value: '2', change: 'neutral' },
    live: { value: '2', change: 'neutral' },
    total: { value: '2', change: 'neutral' },
    color: 'bg-dark',
  },
];

const headers = ['TYPE', 'PRE-MATCH', 'LIVE', 'TOTAL'];

const SportsbookOverview = () => {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col px-6 pt-6">
        <span className="text-base font-extrabold text-gray-900 pb-10">
          Sportsbook Overview {statusMapper['inactive']}
        </span>
        <TableComponent headers={headers} data={tableData} />
      </div>
    </div>
  );
};

export default SportsbookOverview;
