import { Fragment, ReactNode } from 'react';
import ContentWrapper from '@components/core-components/contentTab/ContentWrapper';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import cx from 'classnames';
import { getBrandingConfig } from 'config/brandConfig';
import { statusMapper } from 'utils/common/statusMapper';

interface TabItem {
  key: string;
  label: string | JSX.Element;
  content: ReactNode;
  isDisabled?: boolean;
  statusName?: string;
}

interface TabLayoutProps {
  tabs: TabItem[];
  onTabChange?: (tabKey: string) => void;
  activeKey: string;
  className?: string;
}

export default function TabLayout({ tabs, onTabChange, activeKey, className }: TabLayoutProps) {
  const selectedIndex = tabs.findIndex((tab) => tab.key === activeKey);
  const {
    config: { features },
  } = getBrandingConfig();

  return (
    <TabGroup
      className={cx('w-full h-auto flex flex-col', className)}
      onChange={(index) => onTabChange && onTabChange(tabs[index].key)}
      selectedIndex={selectedIndex >= 0 ? selectedIndex : 0}
    >
      {/* <TabList className="px-[30px] gap-2 bg-blue-tab-color h-10 flex flex-row items-end rounded-t-lg">
        {tabs.map((tab) => (
          <Fragment key={tab.key}>
            <Tab as={Fragment}>
              {({ selected }) => (
                <button
                  className={cx(
                    "flex flex-row text-body-reg-13 p-3 h-[34px] items-center justify-center no-underline font-medium",
                    selected
                      ? "focus:outline-none focus:ring-0 bg-white rounded-t-md text-gray-900"
                      : "text-white"
                  )}
                >
                  {tab.label}
                </button>
              )}
            </Tab>
          </Fragment>
        ))}
      </TabList> */}
      <TabList className="px-[30px] gap-2 bg-blue-tab-color h-10 flex flex-row items-end rounded-t-lg">
        {tabs.map((tab) => {
          if (tab.statusName === 'inactive' && features?.hideNonFunctional) {
            return null;
          }

          return (
            <Fragment key={tab.key}>
              <Tab as={Fragment}>
                {({ selected }) => (
                  <button
                    title={tab.isDisabled ? 'Coming soon' : ''} // ✅ tooltip
                    className={cx(
                      'flex flex-row text-body-reg-13 p-3 h-[34px]  rounded-t-md items-center justify-center no-underline font-medium transition-colors duration-200',
                      selected
                        ? 'focus:outline-none focus:ring-0 bg-white rounded-t-md text-gray-900'
                        : 'text-white'
                    )}
                  >
                    {tab.label} {tab?.statusName && statusMapper[tab.statusName]}
                  </button>
                )}
              </Tab>
            </Fragment>
          );
        })}
      </TabList>
      <TabPanels>
        {tabs.map((tab) => (
          <TabPanel key={tab.key}>
            <ContentWrapper>{tab.content}</ContentWrapper>
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
