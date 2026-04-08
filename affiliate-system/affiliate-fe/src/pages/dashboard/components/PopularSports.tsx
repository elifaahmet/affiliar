import React from 'react';
import { statusMapper } from 'utils/common/statusMapper';

import SportCard from './SportsCard';

const sportsData = [
  {
    id: 1,
    name: 'Football',
    icon: 'football',
    percentage: '65',
    color: 'linear-gradient(262deg, #51A0FE 0%, #1766C3 100%)',
    lineColor: 'bg-[#1B84FF]',
    stats: [
      { label: 'Bet', value: '€530,00', lineColor: '#FF7B31' },
      { label: 'Win', value: '€0,00', lineColor: '#FF7B31' },
      { label: 'Profit', value: '€530,00', lineColor: '#FF7B31' },
    ],
  },
  {
    id: 2,
    name: 'Basketball',
    icon: 'basketball',
    percentage: '80',
    color: 'linear-gradient(262deg, #F90 0%, #864800 100%)',
    lineColor: 'bg-[#FF7B31]',
    stats: [
      { label: 'Bet', value: '€600,00', lineColor: '#01C7D2' },
      { label: 'Win', value: '€100,00', lineColor: '#01C7D2' },
      { label: 'Profit', value: '€700,00', lineColor: '#01C7D2' },
    ],
  },
  {
    id: 3,
    name: 'Tennis',
    icon: 'tennis',
    percentage: '59',
    color: 'linear-gradient(262deg, #22D35F 0%, #007227 100%)',
    lineColor: 'bg-[#13A846]',
    stats: [
      { label: 'Bet', value: '€530,00', lineColor: '#13A846' },
      { label: 'Win', value: '€0,00', lineColor: '#13A846' },
      { label: 'Profit', value: '€530,00', lineColor: '#13A846' },
    ],
  },
  {
    id: 4,
    name: 'Cricket',
    icon: 'cricket',
    percentage: '74',
    color: 'linear-gradient(262deg, #F74552 0%, #9B1111 100%)',
    lineColor: 'bg-[#CD375D]',
    stats: [
      { label: 'Bet', value: '€530,00', lineColor: '#1B84FF' },
      { label: 'Win', value: '€0,00', lineColor: '#1B84FF' },
      { label: 'Profit', value: '€530,00', lineColor: '#1B84FF' },
    ],
  },
  {
    id: 5,
    name: 'Volleyball',
    icon: 'volleyball',
    percentage: '70',
    color: 'linear-gradient(262deg, #00E5E5 0%, #00789E 100%)',
    lineColor: 'bg-[#01C7D2]',
    stats: [
      { label: 'Bet', value: '€450,00', lineColor: '#F74552' },
      { label: 'Win', value: '€50,00', lineColor: '#F74552' },
      { label: 'Profit', value: '€500,00', lineColor: '#F74552' },
    ],
  },
];

function PopularSports() {
  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold text-gray-900 pb-6">
            Top 5 sports {statusMapper['inactive']}
          </span>
        </div>

        <div className="flex flex-wrap gap-6 justify-around">
          {sportsData.map((sport, _index) => (
            <div key={sport.id} className="col-span-1 min-w-[230px]">
              <SportCard {...sport} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PopularSports;
