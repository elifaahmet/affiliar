import { useMemo, useState } from 'react';
import CustomTooltip from '@components/common-components/tooltip';
import PInput from '@components/core-components/input';
import Popup from '@components/core-components/modal/Popup';
import MultiSelect from '@components/core-components/multiple-select';
import { useToast } from '@components/core-components/toaster/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { useAppSelector } from 'hooks/redux';
import { currencySymbolMap } from 'utils/common/currencyUtils';
import { getSupportedCurrencies, getSupportedCurrencyOptions } from 'utils/common/currencyUtils';
import { storageHelper } from 'utils/storage/StorageHelper';

import CurrencySelector from './components/CurrencySelector';
import LimitedBySelector from './components/LimitedBySelector';
import MainLimitDisplay from './components/MainLimitDisplay';

type AddNewLimitsProps = {
  mode: 'casino' | 'player';
  type?: 'time' | 'bet';
  playerId?: string;
  setActiveTab?: (tab: string) => void;
  limits: any[];
  isLoading?: boolean;
  onSaveLimit: (payload: any) => Promise<any>;
  onSaveMainLimit: (payload: any) => Promise<any>;
  queryKey: string;
  refetch?: () => void;
  markEvent?: () => void;
  heading?: string;
};

function AddNewLimits({
  mode,
  playerId,
  setActiveTab,
  limits,
  isLoading,
  onSaveLimit,
  type = 'bet',
  onSaveMainLimit,
  queryKey,
  refetch,
  markEvent,
  heading,
}: AddNewLimitsProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const providers = useAppSelector((state) => state.sharedData.providers);
  const categories = useAppSelector((state) => state.sharedData.categories);

  const supportedCurrencies = useMemo(() => getSupportedCurrencies(), []);
  const [selectedCurrency, setSelectedCurrency] = useState(() => supportedCurrencies[0] || 'INR');
  const [isOpen, setIsOpen] = useState(false);
  const currencyArray = useMemo(() => getSupportedCurrencyOptions(), []);

  const [limitedBy, setLimitedBy] = useState<
    'provider' | 'category' | 'all' | 'daily' | 'weekly' | 'monthly'
  >('category');

  const [isOpenConfirmPopup, setIsOpenConfirmPopup] = useState<boolean>(false);
  const [isOpenAddMainLimit, setIsOpenAddMainLimit] = useState(false);
  const [isOpenLimitWarning, setIsOpenLimitWarning] = useState(false);
  const [tempMainLimitValue, setTempMainLimitValue] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<any[]>([]);
  const [note, setNote] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [percentageInput, setPercentageInput] = useState('');
  const [isPercentage, setIsPercentage] = useState(false);
  const [shouldSwitchToPercentage, setShouldSwitchToPercentage] = useState(false);

  const generalLimit = useMemo(() => {
    if (!limits) return null;
    const filtered = limits?.find((item) => item.currency === selectedCurrency && !item.limitedBy);
    return filtered ? { data: filtered } : null;
  }, [limits, selectedCurrency]);

  const calculatedPercentage = useMemo(() => {
    const main = parseFloat(generalLimit?.data?.amount);
    const amt = parseFloat(amount);
    if (!isNaN(main) && main > 0 && !isNaN(amt)) {
      return ((amt / main) * 100).toFixed(2) + '%';
    }
    return '';
  }, [generalLimit, amount]);

  const onCloseOpenMainLimit = () => {
    setIsOpenAddMainLimit(false);
  };
  const onCloseLimitWarning = () => {
    setIsOpenLimitWarning(false);
  };
  const adminId = storageHelper.getStoreWithDecryption('userId');

  const handleSaveLimit = async (skipWarningCheck = false) => {
    const payload: any = {
      type: 'by_bet',
      currency: selectedCurrency,
      amount: parseFloat(amount),
      percent: isPercentage ? parseFloat(percentageInput) : undefined,
      limitedBy,
      note,
      changedBy: adminId,
    };

    if (mode === 'player' && playerId) payload.playerId = playerId;
    const amt = parseFloat(amount);
    const mainLimit = parseFloat(generalLimit?.data?.amount);

    if (
      generalLimit?.data?.amount &&
      !skipWarningCheck &&
      ((isPercentage && parseFloat(percentageInput) > 100) || (!isPercentage && amt > mainLimit))
    ) {
      setIsOpenLimitWarning(true);
      return;
    }

    if (limitedBy === 'category') {
      payload.category = selectedCategory?.map((c: any) => c.value);
    } else if (limitedBy === 'provider') {
      payload.provider = selectedProvider?.map((c: any) => c.value);
    }

    try {
      await onSaveLimit(payload);
      showToast('Limit created successfully', 'success');
      markEvent && markEvent();
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setSelectedCategory([]);
      setSelectedProvider([]);
      setAmount('');
      setPercentageInput('');
      setNote(null);
    } catch (error: any) {
      const message = error?.response?.data?.message || error.message || 'Failed to create limit';
      showToast(message, 'error');
    }
  };

  const handleConfirm = async () => {
    try {
      const payload: any = {
        newGeneralLimit: parseFloat(tempMainLimitValue),
        currency: selectedCurrency,
        // type: 'by_bet',
      };

      await onSaveMainLimit(payload);
      refetch && refetch();
      markEvent && markEvent();
      setTempMainLimitValue(tempMainLimitValue);
      setIsOpenAddMainLimit(false);
      setIsOpenConfirmPopup(false);
      if (shouldSwitchToPercentage) {
        setIsPercentage(true);
        setShouldSwitchToPercentage(false);
      }
      showToast('Main limit saved successfully', 'success');
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error.message || 'Failed to save main limit';
      showToast(message, 'error');
    }
  };

  // Form Validity
  const isFormValid =
    !!amount &&
    (!isPercentage || (isPercentage && !!generalLimit?.data?.amount)) &&
    ((limitedBy === 'category' && selectedCategory?.length > 0) ||
      (limitedBy === 'provider' && selectedProvider?.length > 0) ||
      limitedBy === 'all');

  return (
    <div className="flex flex-col pb-12">
      <Popup
        isOpen={isOpenAddMainLimit}
        onClose={onCloseOpenMainLimit}
        iconName="globalLimit"
        title={
          generalLimit?.data?.amount ? `Edit Global Referance Limit` : `Add Global Referance Limit`
        }
        description="This limit is the global referance limit defined for the casino. You must define this limit in order to enter a value as a percentage."
        subDescription={
          <div className="w-[300px] pt-5">
            <PInput
              placeholder={'Referance Limit'}
              className="w-full"
              value={tempMainLimitValue}
              onChange={(e) => setTempMainLimitValue(e.target.value)}
              wrapperClassNames="h-full flex justify-center w-full"
              type="number"
            />
          </div>
        }
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={() => {
          onCloseOpenMainLimit();
          generalLimit?.data?.amount ? setIsOpenConfirmPopup(true) : handleConfirm();
        }}
      />
      <Popup
        isOpen={isOpenLimitWarning}
        onClose={onCloseLimitWarning}
        iconName="warning"
        title={'Limit Warning'}
        description="The value you entered (%) exceeds your main limit. Do you approve this?"
        subDescription=""
        confirmText="Approve"
        cancelText="Cancel"
        onConfirm={async () => {
          setIsOpenLimitWarning(false);
          setTimeout(() => {
            handleSaveLimit(true);
          }, 100);
        }}
      />

      <Popup
        isOpen={isOpenConfirmPopup}
        onClose={() => {
          setIsOpenAddMainLimit(false);
          setIsOpenConfirmPopup(false);
        }}
        iconName="warning"
        title={'Update Main Limit?'}
        description="Are you sure, changing this amount will change all the predefined % limit rules. Both the player and casino based limits will be affected."
        subDescription=""
        confirmText="Approve"
        cancelText="Cancel"
        onConfirm={handleConfirm}
      />

      <div className="flex-1 w-full max-w-xl">
        <div className="flex flex-col pb-4">
          <div className="flex flex-row gap-3">
            <span className="text-xl text-gray-900 font-extrabold">
              Add/Edit Limits {heading && `- ${heading}`}
            </span>
            <CustomTooltip
              title="Add/Edit Limits"
              content="Here you can add or edit limits for the selected categories or providers."
              placement="right"
            />
          </div>
          <span className="text-sm font-medium text-gray-600">
            Which one would you like to add a limit to?
          </span>
        </div>
        <div className="flex flex-col">
          <CurrencySelector
            selectedCurrency={selectedCurrency}
            setSelectedCurrency={setSelectedCurrency}
            currencyArray={currencyArray}
            isOpen={isOpen}
            setIsOpen={setIsOpen}
          />
          {isLoading ? (
            <div className="flex items-left justify-left h-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <MainLimitDisplay
              generalLimit={generalLimit}
              selectedCurrency={selectedCurrency}
              setIsOpenAddMainLimit={setIsOpenAddMainLimit}
              setTempMainLimitValue={setTempMainLimitValue}
            />
          )}
          <div className="flex flex-row gap-3 pb-4">
            <LimitedBySelector
              timeBased={type === 'time' ? true : false}
              limitedBy={limitedBy}
              setLimitedBy={setLimitedBy}
              setActiveTab={setActiveTab}
            />
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveLimit();
          }}
        >
          {limitedBy === 'category' && (
            <div className="flex flex-col">
              <hr className="flex w-1/2 bg-gray-300 h-[1px]" />
              <div className="min-h-[50px] flex flex-row items-center w-full justify-between">
                <span className="flex w-1/2 text-body-reg-14 font-medium text-gray-700">
                  Category
                </span>

                <MultiSelect
                  key={JSON.stringify(selectedCategory)}
                  options={categories}
                  value={selectedCategory}
                  onChange={(val) => setSelectedCategory(val)}
                  classname="w-1/2"
                  label="Categories"
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

                <MultiSelect
                  key={JSON.stringify(selectedProvider)}
                  options={providers}
                  value={selectedProvider}
                  onChange={(val) => setSelectedProvider(val)}
                  classname="w-1/2"
                  label="Providers"
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
                    isPercentage ? 'text-primary font-bold' : 'text-gray-700 font-medium'
                  }`}
                >
                  (%)
                </span>
                <label className="inline-flex relative items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!isPercentage}
                    onChange={() => {
                      if (!isPercentage && !generalLimit?.data) {
                        setIsOpenAddMainLimit(true);
                        setShouldSwitchToPercentage(true);
                        return;
                      }
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
                    !isPercentage ? 'text-primary font-bold' : 'text-gray-700 font-medium'
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
                  ? `${amount || '0'} ${currencySymbolMap[selectedCurrency]}`
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
                    if (!isNaN(percent) && parseFloat(generalLimit?.data?.amount) > 0) {
                      const newAmount = (
                        (percent / 100) *
                        parseFloat(generalLimit?.data?.amount)
                      ).toFixed(2);
                      setAmount(newAmount.toString());
                    } else {
                      setAmount('');
                    }
                  } else {
                    setAmount(input);
                    const amt = parseFloat(input);
                    if (!isNaN(amt) && parseFloat(generalLimit?.data?.amount) > 0) {
                      const newPercent = (
                        (amt / parseFloat(generalLimit?.data?.amount)) *
                        100
                      ).toFixed(2);
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
          <div className="flex w-full justify-end pt-5">
            <button
              type="submit"
              className={`flex items-center justify-center text-body-reg-13 font-bold h-10 px-4 w-[140px] text-white  bg-primary hover:bg-primary-dark rounded-lg ${
                isFormValid ? '' : 'opacity-50 cursor-not-allowed'
              }`}
              disabled={!isFormValid}
            >
              Saves
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddNewLimits;
