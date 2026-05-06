import { useEffect } from 'react';
import Icon from '@components/core-components/icon';

interface Currency {
  value: string;
  label: string;
}

interface Props {
  selectedCurrency: string;
  setSelectedCurrency: (val: string) => void;
  currencyArray: Currency[];
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

const CurrencySelector = ({
  selectedCurrency,
  setSelectedCurrency,
  currencyArray,
  isOpen,
  setIsOpen,
}: Props) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.getElementById('currency-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div id="currency-dropdown" className="relative w-full pb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[42px] flex items-center justify-between px-3 border border-[#C4B5FD] rounded-md bg-gray-100"
      >
        <div className="flex items-center gap-2">
          <Icon iconName={getIconName(selectedCurrency)} svgProps={{ width: 20, height: 20 }} />
          <span className="text-gray-700 font-bold text-body-reg-13">
            Selected Currency: {selectedCurrency}
          </span>
        </div>
        <div className="absolute inset-y-0 right-1 justify-center overflow-hidden rounded flex items-center pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d="M5.99916 6.90004C5.90046 6.90061 5.80261 6.88169 5.71123 6.84437C5.61985 6.80705 5.53674 6.75205 5.46666 6.68254L0.966663 2.18254C0.896734 2.11261 0.841263 2.02959 0.803418 1.93823C0.765573 1.84686 0.746094 1.74894 0.746094 1.65004C0.746094 1.45031 0.825435 1.25877 0.966663 1.11754C1.10789 0.976313 1.29944 0.896973 1.49916 0.896973C1.69889 0.896973 1.89043 0.976313 2.03166 1.11754L5.99916 5.08504L9.96666 1.11754C10.0366 1.04761 10.1196 0.992141 10.211 0.954296C10.3023 0.916451 10.4003 0.896973 10.4992 0.896973C10.5981 0.896973 10.696 0.916451 10.7873 0.954296C10.8787 0.992141 10.9617 1.04761 11.0317 1.11754C11.1016 1.18747 11.1571 1.27049 11.1949 1.36185C11.2328 1.45322 11.2522 1.55115 11.2522 1.65004C11.2522 1.74894 11.2328 1.84686 11.1949 1.93823C11.1571 2.02959 11.1016 2.11261 11.0317 2.18254L6.53166 6.68254C6.46158 6.75205 6.37847 6.80705 6.28709 6.84437C6.19571 6.88169 6.09787 6.90061 5.99916 6.90004Z"
              fill="#4B5675"
            />
          </svg>
        </div>
      </button>

      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-gray-100 border border-gray-300 rounded-md shadow-md max-h-48 overflow-auto text-gray-700 font-bold text-body-reg-13">
          {currencyArray.map((cur) => (
            <li
              key={cur.value}
              onClick={() => {
                setSelectedCurrency(cur.value);
                setIsOpen(false);
              }}
              className="p-3 hover:bg-blue-200 cursor-pointer"
            >
              {cur.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CurrencySelector;

function getIconName(currency: string) {
  switch (currency) {
    case 'EUR':
      return 'euro';
    case 'USD':
      return 'usd';
    case 'INR':
      return 'inr';
    case 'HKD':
      return 'hkd';
    case 'USDT':
      return 'usdt';
    case 'CNY':
      return 'cny';
    case 'GBP':
      return 'gbp';
    case 'RSD':
      return 'rsd';
    case 'TRY':
      return 'tl';
    default:
      return '';
  }
}
