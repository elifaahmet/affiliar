import { Navigate, useSearchParams } from 'react-router-dom';
import TabLayout from '@components/core-components/contentTab/TabLayout';

import Overview from '../tabs/overview';

function ContentArea() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: <Overview />,
    },
  ];

  const handleTabChange = (key: string) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', key);
    setSearchParams(newParams);
  };

  if (!currentTab || currentTab !== 'overview') {
    return <Navigate to='?tab=overview' replace />;
  }

  return (
    <div className='bg-gray-100 h-full w-full flex flex-col rounded-lg shadow-[0px_3px_4px_0px_rgba(0,0,0,0.03)]'>
      <TabLayout tabs={tabs} onTabChange={handleTabChange} activeKey={currentTab} />
    </div>
  );
}

export default ContentArea;
