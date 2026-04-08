import { useMemo, useState } from 'react';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { currencySymbolMap } from 'utils/common/currencyUtils';
import { storageHelper } from 'utils/storage/StorageHelper';

const limitedByOptions = [
  {
    label: 'Category',
    value: 'category',
    icon: 'categoryChip',
  },
  {
    label: 'Provider',
    value: 'provider',
    icon: 'providerChip',
  },
  {
    label: 'Game',
    value: 'game',
    icon: 'cherryChip',
  },
];
const timeBasedOptions = [
  {
    label: 'Daily Limit',
    value: 'daily',
    icon: 'daily',
  },
  {
    label: 'Weekly Limit',
    value: 'weekly',
    icon: 'weekly',
  },
  {
    label: 'Monthly Limit',
    value: 'monthly',
    icon: 'monthly',
  },
];

type UpdateLimitsProps = {
  limitedBy: 'game' | 'provider' | 'category';
  selectedCurrency?: string;
  selectedCategory?: string;
  selectedProvider?: string;
  selectedGame?: string;
  limit: string;
  percentage: string;
  mainAmount: string;
  timeBased?: boolean;
  defaultNote: string | null;
  onSaveLimit: (payload: any) => Promise<any>;
  queryKey: string;
  markEvent?: () => void;
};

function UpdateLimits({
  limitedBy,
  selectedCurrency,
  selectedCategory,
  selectedProvider,
  selectedGame,
  timeBased = false,
  limit,
  percentage,
  mainAmount,
  defaultNote,
  onSaveLimit,
  queryKey,
  markEvent,
}: UpdateLimitsProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<any | null>(defaultNote || null);
  const [amount, setAmount] = useState(mainAmount || '');
  const [percentageInput, setPercentageInput] = useState(percentage || '');
  const [isPercentage, setIsPercentage] = useState(false);
  const { showToast } = useToast();
  const options = timeBased ? timeBasedOptions : limitedByOptions;
  const calculatedPercentage = useMemo(() => {
    const main = parseFloat(limit);
    const amt = parseFloat(amount);
    if (!isNaN(main) && main > 0 && !isNaN(amt)) {
      return ((amt / main) * 100).toFixed(2) + '%';
    }
    return '';
  }, [amount, limit]);

  const adminId = storageHelper.getStoreWithDecryption('userId');

  const handleSaveLimit = async () => {
    const payload: any = {
      amount: parseFloat(amount),
      percent: isPercentage ? parseFloat(percentageInput) : undefined,
      note,
      changedBy: adminId,
    };

    try {
      await onSaveLimit(payload);
      showToast('Limit updated successfully', 'success');
      markEvent && markEvent();
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error: any) {
      const message = error?.response?.data?.message || error.message || 'Failed to create limit';
      showToast(message, 'error');
    }
  };

  const isFormValid = !!amount && (!isPercentage || (isPercentage && !!mainAmount));

  return (
    <>
      <div className="flex flex-col py-12 ">
        <div className="flex-1 mx-auto w-full max-w-xl">
          <div className="flex flex-col pb-4">
            <span className="text-xl text-gray-900 font-extrabold">Edit Limit</span>
          </div>
          <div className="flex flex-col">
            <div id="currency-dropdown" className="relative w-full pb-4">
              <button
                disabled
                className="opacity-50 cursor-not-allowed w-full h-[42px] flex items-center justify-between px-3 border border-[#A4D7FF] rounded-md bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    iconName={
                      selectedCurrency === 'EUR'
                        ? 'euro'
                        : selectedCurrency === 'USD'
                          ? 'usd'
                          : selectedCurrency === 'INR'
                            ? 'inr'
                            : selectedCurrency === 'HKD'
                              ? 'hkd'
                              : selectedCurrency === 'USDT'
                                ? 'usdt'
                                : selectedCurrency === 'CNY'
                                  ? 'cny'
                                  : selectedCurrency === 'GBP'
                                    ? 'gbp'
                                    : selectedCurrency === 'RSD'
                                      ? 'rsd'
                                      : selectedCurrency === 'TRY'
                                        ? 'tl'
                                        : ''
                    }
                    svgProps={{ width: 20, height: 20 }}
                  />
                  <span className="text-gray-700 font-bold text-body-reg-13">
                    Selected Currency: {selectedCurrency}
                  </span>
                </div>
              </button>
            </div>

            <div className="flex flex-row gap-3 pb-4">
              {options.map((item) => {
                const isActive = limitedBy === item.value;
                return (
                  <button
                    key={item.value}
                    className={`opacity-50 cursor-not-allowed flex items-center gap-3 px-6 py-3 rounded-[10px] w-full border transition-all font-extrabold text-base
                        ${
                          isActive
                            ? 'bg-primary-light border-primary text-primary'
                            : 'bg-gray-200 border-gray-400 text-gray-700'
                        }
                      `}
                  >
                    <Icon
                      iconName={item.icon}
                      svgProps={{
                        width: 27,
                        height: 27,
                        fill: isActive ? '#329EF0' : undefined,
                      }}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-row w-full mb-4 items-center gap-3">
              <Icon iconName="performance" svgProps={{ width: 26, height: 26 }} />
              <span className="text-xs font-bold text-gray-700">
                Main Limit: {selectedCurrency ? currencySymbolMap[selectedCurrency] : ''}{' '}
                {limit.toString() ?? ''}
              </span>
            </div>

            {(limitedBy === 'category' || limitedBy === 'game') && (
              <div className="flex flex-col">
                <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
                <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                  <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">
                    Category
                  </span>

                  <PInput
                    value={selectedCategory}
                    className="w-full"
                    wrapperClassNames="h-full flex justify-center w-1/2"
                    disabled
                  />
                </div>
              </div>
            )}

            {limitedBy === 'provider' && (
              <div className="flex flex-col">
                <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
                <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                  <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">
                    Provider
                  </span>

                  <PInput
                    value={selectedProvider}
                    className="w-full"
                    wrapperClassNames="h-full flex justify-center w-1/2"
                    disabled
                  />
                </div>
              </div>
            )}

            {limitedBy === 'game' && (
              <div className="flex flex-col">
                <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
                <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                  <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">
                    Game
                  </span>
                  <PInput
                    value={selectedGame}
                    className="w-full"
                    wrapperClassNames="h-full flex justify-center w-1/2"
                    disabled
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col">
              <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
              <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">Note</span>

                <PInput
                  placeholder="Note"
                  className="w-full"
                  value={note || ''}
                  onChange={(e) => setNote(e.target.value)}
                  wrapperClassNames="h-full flex justify-center w-1/2"
                />
              </div>
            </div>

            <div className="flex flex-col">
              <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
              <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">
                  {isPercentage ? '(%)' : 'Amount'}
                </span>

                <div className="flex flex-row gap-3 items-center justify-start w-1/2">
                  <span
                    className={`text-sm cursor-pointer ${
                      isPercentage ? 'text-primary font-bold' : 'text-gray-500 font-medium'
                    }`}
                  >
                    (%)
                  </span>
                  <label className="inline-flex relative items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isPercentage}
                      onChange={() => {
                        setIsPercentage((prev) => !prev);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-14 h-8 bg-primary rounded-lg transition-all relative">
                      <div
                        className={`absolute top-[4px] left-[4px] bg-white border border-gray-300 h-6 w-6 rounded-md transition-all flex items-center justify-center gap-[2px]
                          ${!isPercentage ? 'translate-x-full border-white' : ''}`}
                      >
                        <div className="w-[2px] h-[12px] bg-[#D4D9E6] rounded-sm"></div>
                        <div className="w-[2px] h-[12px] bg-[#D4D9E6] rounded-sm"></div>
                        <div className="w-[2px] h-[12px] bg-[#D4D9E6] rounded-sm"></div>
                      </div>
                    </div>
                  </label>
                  <span
                    className={`text-sm cursor-pointer ${
                      !isPercentage ? 'text-primary font-bold' : 'text-gray-500 font-medium'
                    }`}
                  >
                    Amount
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                <span className="flex w-1/2 text-xs font-medium text-gray-700 justify-end pr-3">
                  Value Based on {isPercentage ? 'Amount' : '(%)'}:{' '}
                  {isPercentage
                    ? `${amount || '0'} ${selectedCurrency ? currencySymbolMap[selectedCurrency] : ''}`
                    : calculatedPercentage || '0%'}
                </span>

                <PInput
                  placeholder={isPercentage ? '(%)' : 'Amount'}
                  className="w-full"
                  type="number"
                  value={isPercentage ? percentageInput : amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const input = raw.replace('%', '');
                    if (isPercentage) {
                      setPercentageInput(input);
                      const percent = parseFloat(input);
                      if (!isNaN(percent) && parseFloat(limit) > 0) {
                        const newAmount = ((percent / 100) * parseFloat(limit)).toFixed(2);
                        setAmount(newAmount.toString());
                      } else {
                        setAmount('');
                      }
                    } else {
                      setAmount(input);
                      const amt = parseFloat(input);
                      if (!isNaN(amt) && parseFloat(limit) > 0) {
                        const newPercent = ((amt / parseFloat(limit)) * 100).toFixed(2);
                        setPercentageInput(newPercent);
                      } else {
                        setPercentageInput('');
                      }
                    }
                  }}
                  wrapperClassNames="h-full flex justify-center w-1/2"
                />
              </div>
              <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
            </div>
          </div>
          <div className="flex w-full justify-end pt-5">
            <button
              className={`flex items-center justify-center text-body-reg-13 font-bold h-10 px-4 w-[140px] text-white  bg-primary hover:bg-primary-dark rounded-lg ${
                isFormValid ? '' : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => handleSaveLimit()}
              disabled={!isFormValid}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default UpdateLimits;
