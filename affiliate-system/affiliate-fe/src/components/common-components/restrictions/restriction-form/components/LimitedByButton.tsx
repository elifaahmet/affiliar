import React from 'react';
import Icon from '@components/core-components/icon';

type LimitedByButtonProps = {
  label: string;
  value: 'game' | 'provider' | 'category';
  icon: string;
  isActive: boolean;
  onClick: (value: 'game' | 'provider' | 'category') => void;
};

const LimitedByButton = ({ label, value, icon, isActive, onClick }: LimitedByButtonProps) => (
  <button
    onClick={() => onClick(value)}
    className={`flex items-center gap-3 px-6 py-3 rounded-[10px] w-full border transition-all font-extrabold text-base
      ${
        isActive
          ? 'bg-primary-light border-primary text-primary'
          : 'bg-gray-200 border-gray-400 text-gray-700'
      }
    `}
  >
    <Icon
      iconName={icon}
      svgProps={{
        width: 27,
        height: 27,
        fill: isActive ? '#329EF0' : undefined,
      }}
    />
    <span>{label}</span>
  </button>
);

export default LimitedByButton;
