import React from 'react';
import Icon from '@components/core-components/icon';
import { statusMapper } from 'utils/common/statusMapper';

interface ActivityCardProps {
  title: string;
  data: {
    id: number;
    title: string;
    amount: string;
    icon: string;
    bgColor: string;
  }[];
}

const ActivityCard: React.FC<ActivityCardProps> = ({ title, data }) => {
  return (
    <div
      className="bg-white rounded-[10px] p-6 overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="pb-4 border-b border-dashed border-borderColor">
        <span className="text-base font-extrabold text-gray-900">
          {title} {statusMapper['inactive']}
        </span>
      </div>

      <ul>
        {data.map((item, _index) => (
          <li
            key={item.id}
            className={`flex items-center justify-between bg-white py-4 border-b border-dashed border-borderColor
             `}
          >
            <div className="flex items-center space-x-4">
              <span
                className={`flex w-11 h-11 items-center justify-center text-white rounded-lg ${item.bgColor}`}
              >
                <Icon iconName={item.icon} svgProps={{ width: 24, height: 24, fill: 'bg-white' }} />
              </span>
              <div>
                <p className="text-xs font-bold text-gray-600">{item.title}</p>
                <p className="text-xl font-extrabold text-gray-900">{item.amount}</p>
              </div>
            </div>
            <Icon iconName="arrowRightWithBg" svgProps={{ width: 24, height: 24 }} />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActivityCard;
