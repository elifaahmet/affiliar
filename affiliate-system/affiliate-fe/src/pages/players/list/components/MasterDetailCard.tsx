import React from 'react';
import Icon from '@components/core-components/icon';

interface CardSection {
  title: string;
  items: { label: string; iconName: string }[];
  topBorderColor: string;
}

interface MasterDetailCardProps {
  section: CardSection;
}

const MasterDetailCard: React.FC<MasterDetailCardProps> = ({ section }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg w-60">
      <div className={`h-3 rounded-t-lg ${section.topBorderColor}`} />
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-700">{section.title}</h3>
        </div>
        <ul>
          {section.items.map((item, index) => (
            <li key={index} className="flex items-start gap-1 py-1">
              <Icon iconName={item.iconName} />
              <span className="text-gray-700">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MasterDetailCard;
