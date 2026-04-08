import React from 'react';
import { getBrandingConfig } from 'config/brandConfig';
import { statusMapper } from 'utils/common/statusMapper';

interface TabData {
  label: string;
  statusName?: string;
}

interface TabComponentProps {
  tabs: TabData[];
  activeTab: string;
  onTabClick: (tab: TabData) => void;
  buttonWidth?: string;
  type?: 'default' | 'withBackground';
  bg?: string;
}

const TabComponent: React.FC<TabComponentProps> = ({
  tabs,
  activeTab,
  onTabClick,
  buttonWidth = 'w-auto',
  type = 'default',
  bg,
}) => {
  const {
    config: { features },
  } = getBrandingConfig();
  return (
    <div className={`flex w-auto h-full gap-1 p-1 rounded-lg ${bg}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.label;

        const defaultStyle = isActive
          ? 'border-b-2 border-primary text-primary font-bold pb-4'
          : 'text-gray-700 hover:text-gray-800 font-medium border-b-2 border-transparent pb-4';

        const withBackgroundStyle = isActive
          ? 'bg-primary text-white font-medium rounded-lg h-[30px] w-auto whitespace-nowrap'
          : 'text-gray-700 rounded-lg font-medium hover:bg-primary-light h-[30px] w-auto whitespace-nowrap';

        if (tab.statusName === 'inactive' && features?.hideNonFunctional) {
          return null;
        }

        return (
          <button
            key={tab.label}
            className={`${buttonWidth} px-4 text-sm transition-all ${
              type === 'withBackground' ? withBackgroundStyle : defaultStyle
            }`}
            onClick={() => onTabClick(tab)}
          >
            {tab.label} {tab.statusName && statusMapper[tab?.statusName || 'default']}
            {/* Optionally display statusName */}
            {/* {tab.statusName && (
              <span className="ml-1 text-xs text-gray-400">({tab.statusName})</span>
            )} */}
          </button>
        );
      })}
    </div>
  );
};
export default TabComponent;
