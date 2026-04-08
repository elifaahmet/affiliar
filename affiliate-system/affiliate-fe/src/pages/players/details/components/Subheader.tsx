import React from 'react';
import cx from 'classnames';

interface SubheaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: string[];
  className?: string;
}

const Subheader: React.FC<SubheaderProps> = ({ activeTab, onTabChange, tabs, className }) => {
  return (
    <div className={cx('h-[34px] w-full overflow-auto bg-white mb-4 -mt-5', className)}>
      <div className="h-full flex flex-row gap-4 justify-start items-center border-b border-[#F1F1F4]">
        {tabs.map((tab: string) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={cx('h-full font-bold text-body-reg-13 relative', {
              'text-primary': activeTab === tab,
              'text-gray-600 hover:text-primary-medium': activeTab !== tab,
            })}
          >
            {tab}
            <div
              className={cx('absolute bottom-0 w-full h-[2px] bg-primary', {
                'opacity-100': activeTab === tab,
                'opacity-0': activeTab !== tab,
              })}
            ></div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Subheader;
