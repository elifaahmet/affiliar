import Icon from '@components/core-components/icon';
import { currencySymbolMap } from 'utils/common/currencyUtils';

interface Props {
  generalLimit: any;
  selectedCurrency: string;
  setIsOpenAddMainLimit: (val: boolean) => void;
  setTempMainLimitValue: (val: string) => void;
}

const MainLimitDisplay = ({
  generalLimit,
  selectedCurrency,
  setIsOpenAddMainLimit,
  setTempMainLimitValue,
}: Props) => {
  const hasMainLimit = !!generalLimit?.data?.amount;

  if (!hasMainLimit) {
    return (
      <div className="flex w-full py-3 px-3 mb-4 justify-between bg-[#FFF8F4] rounded-[10px] border border-warning">
        <div className="flex flex-row gap-3 items-center">
          <Icon iconName="alertOrange" svgProps={{ width: 26, height: 26 }} />
          <span className="text-xs font-bold text-gray-700">
            Define a global referance limit that will apply to the entire casino in order to
            calculate the percentage.
          </span>
        </div>
        <button
          onClick={() => {
            setTempMainLimitValue('');
            setIsOpenAddMainLimit(true);
          }}
          className="text-xs font-bold w-20 text-orange underline"
        >
          Add Limit
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full py-2 px-5 mb-4 justify-between bg-[#E9F5FF] rounded-[10px] border border-primary">
      <div className="flex  gap-3">
        {' '}
        <Icon iconName="globalLimit" svgProps={{ width: 26, height: 26, fill: '#4b5675' }} />
        <div className="flex flex-col gap-1">
          {' '}
          <span className="text-xs font-bold text-gray-700">
            Global Referance Limit: {currencySymbolMap[selectedCurrency]}{' '}
            {generalLimit?.data.amount?.toString() ?? ''}
          </span>
          <span className="text-xs  text-gray-500">
            This limit is the base limit you will use for your percentage calculation.
          </span>
        </div>
      </div>
      <button
        onClick={() => {
          setTempMainLimitValue(generalLimit?.data?.amount?.toString() || '');
          setIsOpenAddMainLimit(true);
        }}
        className="text-xs font-bold text-primary underline"
      >
        Edit Limit
      </button>
    </div>
  );
};

export default MainLimitDisplay;
