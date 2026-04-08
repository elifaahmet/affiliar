import React from 'react';

interface TabOption {
  label: string;
  value: any;
}

interface TabObjectComponentProps {
  tabs: TabOption[];
  activeTab: TabOption;
  onTabClick: (tab: TabOption) => void;
  buttonWidth?: string;
  type?: 'default' | 'withBackground';
  bg?: string;
}

const TabObjectComponent: React.FC<TabObjectComponentProps> = ({
  tabs,
  activeTab,
  onTabClick,
  buttonWidth = 'w-auto',
  type = 'default',
  bg = '',
}) => {
  return (
    <div className={`flex w-auto h-full gap-1 p-1 rounded-lg ${bg}`}>
      {tabs.map((tab) => {
        const isActive = activeTab.label === tab.label;

        const defaultStyle = isActive
          ? 'border-b-2 border-primary text-primary font-bold pb-4'
          : 'text-gray-700 hover:text-gray-800 font-medium border-b-2 border-transparent pb-4';

        const withBackgroundStyle = isActive
          ? 'bg-primary text-white font-medium rounded-lg h-[30px] w-auto whitespace-nowrap'
          : 'text-gray-700 rounded-lg font-medium hover:bg-primary-light h-[30px] w-auto whitespace-nowrap';

        return (
          <button
            key={tab.label}
            className={`${buttonWidth} px-4 text-sm transition-all ${
              type === 'withBackground' ? withBackgroundStyle : defaultStyle
            }`}
            onClick={() => onTabClick(tab)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabObjectComponent;
