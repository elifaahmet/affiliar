import React from 'react';
import Icon from '@components/core-components/icon';

interface SportCardProps {
  name: string;
  icon: string;
  percentage: string;
  color: string;
  lineColor?: string;
  stats: {
    label: string;
    value: string;
    lineColor: string;
  }[];
}

const SportCard: React.FC<SportCardProps> = ({
  name,
  icon,
  percentage,
  color,
  lineColor,
  stats,
}) => {
  return (
    <div className="flex w-full rounded-[10px] overflow-hidden">
      <div className="flex flex-col p-0 w-full">
        <div
          className={`flex w-full justify-between items-center p-4 text-white`}
          style={{ background: color }}
        >
          <div className="flex items-center gap-4 p-0">
            <div className={`flex items-center justify-center`}>
              <Icon iconName={icon} svgProps={{ width: 35, height: 35 }} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold">{name}</span>
              <span className="text-xs font-bold text-[#E2E2E2]">Top 1</span>
            </div>
          </div>
          <span className="text-2xl font-extrabold">
            {percentage}
            <span className="text-lg">%</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 p-5 rounded-b-[10px] border border-t-0 border-dashed border-borderColor">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className={`w-1 h-6 rounded-lg ${lineColor}`}></div>
              <div className="flex justify-between flex-grow text-sm font-medium text-gray-900">
                <span>{stat.label}</span>
                <span className="font-bold">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SportCard;
