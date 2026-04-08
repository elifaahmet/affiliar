import UpdateLimits from '@components/common-components/update-limits';
import { PDataGrid } from '@components/core-components/grid/PDataGrid';
import axiosInstance from 'config/axiosInstance';

import { TAB_CONFIGS, TAB_CONFIGS_BY_TIME } from '../constants';

interface DataGridRendererProps {
  activeTab: string;
  queryKey: string;
  rowData: any[];
  isLoading: boolean;
  timeBased?: boolean;
  limits: any[];
  getColDefProps: (tabKey: string) => any;
  updateLimitEndpoint: (id: string) => string;
  isRefetch?: boolean;
  markEvent?: () => void;
}

export default function DataGridRenderer({
  activeTab,
  queryKey,
  timeBased = false,
  rowData,
  isLoading,
  limits,

  getColDefProps,
  updateLimitEndpoint,
  isRefetch = false,
  markEvent,
}: DataGridRendererProps) {
  const config = timeBased ? TAB_CONFIGS_BY_TIME[activeTab] : TAB_CONFIGS[activeTab];

  if (!config) return null;

  const baseProps = {
    showFooter: config.showFooter || false,
    rowModelType: 'clientSide' as const,
    colDefs: config.getColDefs(getColDefProps(activeTab)),
    detailCellRenderer: (params: any) => {
      const { limitedBy, currency, category, provider, game, amount, percent, note } = params.data;
      const generalLimit = limits?.find((item) => item.currency === currency && !item.limitedBy);
      return (
        <div className="flex bg-gray-200 px-8 border-none w-full overflow-auto">
          <UpdateLimits
            limitedBy={limitedBy}
            selectedCurrency={currency}
            selectedCategory={category?.name}
            selectedProvider={provider?.name}
            selectedGame={game?.game_name}
            mainAmount={amount}
            timeBased={timeBased}
            percentage={percent}
            queryKey={queryKey}
            markEvent={() => isRefetch && markEvent && markEvent()}
            limit={generalLimit?.amount || 0}
            defaultNote={note || null}
            onSaveLimit={async (payload) => {
              const res = await axiosInstance.patch(updateLimitEndpoint(params.data._id), {
                ...payload,
              });
              return res.data;
            }}
          />
        </div>
      );
    },
  };

  return (
    <PDataGrid key={activeTab} {...baseProps} rowData={rowData} loading={isLoading} showFooter />
  );
}
