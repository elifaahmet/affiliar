import React, { useState } from 'react';
import TableComponent from '@components/common-components/table';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { getBrandingConfig } from 'config/brandConfig';

const FinancialInsights = ({ tableData, headers }: { tableData: any; headers: string[] }) => {
  const {
    config: { features },
  } = getBrandingConfig();

  const [filter, setFilter] = useState('sportsbook');

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col px-5 py-6">
        {!features?.hideNonFunctional && (
          <div className="flex flex-row justify-between items-center pb-3">
            <span className="text-base font-extrabold text-gray-900">Financial Insights 🚫</span>
            <BSelectWithSearch
              label="Type"
              options={[
                { value: 'sportsbook', label: 'Sportsbook' },
                { value: 'casino', label: 'Casino' },
                { value: 'exchange', label: 'Exchange' },
              ]}
              value={filter || ''}
              onChange={setFilter}
              classname="h-full w-[237px]"
              showSearch={false}
            />
          </div>
        )}
        <TableComponent headers={headers} data={tableData} />
      </div>
    </div>
  );
};

export default FinancialInsights;
