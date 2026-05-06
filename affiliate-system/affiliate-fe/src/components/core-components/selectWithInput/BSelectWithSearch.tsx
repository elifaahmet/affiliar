import React, { useEffect, useRef, useState } from 'react';
import { FieldError } from 'react-hook-form';
import { getCasinoCategoryIcon } from 'utils/common/getCategoryIcon';

import Icon from '../icon';
import PInput from '../input';

interface Option {
  label: string;
  value: string;
}

interface BSelectWithSearchProps {
  label?: string;
  value?: string | Option;
  onChange: (value: string) => void;
  options: Option[];
  classname?: string;
  error?: FieldError;
  placeholder?: string;
  showSearch?: boolean;
  valueIsObject?: boolean;
  disabled?: boolean;
  showIcon?: boolean;
  onSearch?: (value: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  disableClientFilter?: boolean;
}

const svg = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    className="mt-[1px]" // fine-tune if needed
  >
    <path
      d="M11.4438 1.34233L1.37764 11.4792C1.15438 11.7025 1.00235 11.9787 0.954989 12.247C0.907629 12.5154 0.968819 12.754 1.1251 12.9103C1.28138 13.0665 1.51995 13.1277 1.78832 13.0804C2.0567 13.033 2.33289 12.881 2.55615 12.6577L12.6223 2.52084C12.8456 2.29758 12.9976 2.02138 13.045 1.75301C13.0923 1.48464 13.0311 1.24607 12.8749 1.08979C12.7186 0.933507 12.48 0.872316 12.2116 0.919676C11.9433 0.967037 11.6671 1.11907 11.4438 1.34233Z"
      fill="#78829D"
    />
    <path
      d="M12.6577 11.4438L2.52079 1.37767C2.29754 1.15441 2.02134 1.00238 1.75297 0.955019C1.48459 0.907659 1.24602 0.96885 1.08974 1.12513C0.933464 1.28141 0.872273 1.51998 0.919634 1.78835C0.966994 2.05673 1.11902 2.33292 1.34228 2.55618L11.4792 12.6223C11.7024 12.8456 11.9786 12.9976 12.247 13.045C12.5154 13.0924 12.7539 13.0312 12.9102 12.8749C13.0665 12.7186 13.1277 12.48 13.0803 12.2117C13.033 11.9433 12.8809 11.6671 12.6577 11.4438Z"
      fill="#78829D"
    />
  </svg>
);
const BSelectWithSearch: React.FC<BSelectWithSearchProps> = ({
  label,
  value,
  onChange,
  options,
  classname = '',
  error,
  placeholder = '',
  showSearch = true,
  valueIsObject,
  disabled = false,
  showIcon = false,
  onSearch,
  onLoadMore,
  hasMore = false,
  loading = false,
  disableClientFilter = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);

  const filteredOptions = disableClientFilter
    ? options
    : options.filter(
        (option) =>
          typeof option.label === 'string' &&
          option.label.toLowerCase().includes(search.toLowerCase())
      );
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  return (
    <>
      <div
        ref={selectRef}
        className={`relative h-10 bg-gray-100 rounded-md border border-[#C4B5FD] cursor-pointer ${
          classname ? classname : ' w-full '
        } ${disabled ? 'border-gray-400 cursor-not-allowed opacity-50' : ''}`}
      >
        {/* Floating Label */}
        {!(showIcon && value) && label && (
          <label
            className={`absolute w-22 left-3 transform transition-all duration-200  max-w-[calc(100%-30px)] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer text-sm ${
              value
                ? 'top-1 text-xs font-medium text-gray-600'
                : 'top-1/2 -translate-y-1/2 font-medium text-gray-600'
            }`}
            onClick={() => setIsOpen(true)}
          >
            {label}
          </label>
        )}

        {/* Display selected value */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`h-10 flex items-center px-3 ${showIcon && value ? 'pt-0' : 'pt-3'} text-sm text-gray-900 rounded-md    ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          {showIcon && value ? (
            <Icon
              iconName={getCasinoCategoryIcon(
                valueIsObject && typeof value === 'object'
                  ? value.label
                  : options.find((opt) => opt.value === value)?.label || ''
              )}
              svgProps={{ width: 16, height: 16 }}
              className="mr-2"
            />
          ) : null}
          {value
            ? valueIsObject && typeof value === 'object'
              ? value?.label
              : options.find((opt) => opt.value === value)?.label
            : placeholder}
        </div>
        {/* Dropdown Icon */}
        <div
          className="absolute inset-y-0 right-2 flex items-center cursor-pointer z-1"
          onClick={(e) => {
            e.stopPropagation();
            if (value) {
              onChange('');
              setSearch('');
              setIsOpen(false);
            } else {
              setIsOpen(!isOpen);
            }
          }}
        >
          {value ? (
            <>{svg}</>
          ) : (
            // fallback: dropdown arrow icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 12 8"
              fill="none"
            >
              <path
                d="M5.99916 6.90004C5.90046 6.90061 5.80261 6.88169 5.71123 6.84437C5.61985 6.80705 5.53674 6.75205 5.46666 6.68254L0.966663 2.18254C0.896734 2.11261 0.841263 2.02959 0.803418 1.93823C0.765573 1.84686 0.746094 1.74894 0.746094 1.65004C0.746094 1.45031 0.825435 1.25877 0.966663 1.11754C1.10789 0.976313 1.29944 0.896973 1.49916 0.896973C1.69889 0.896973 1.89043 0.976313 2.03166 1.11754L5.99916 5.08504L9.96666 1.11754C10.0366 1.04761 10.1196 0.992141 10.211 0.954296C10.3023 0.916451 10.4003 0.896973 10.4992 0.896973C10.5981 0.896973 10.696 0.916451 10.7873 0.954296C10.8787 0.992141 10.9617 1.04761 11.0317 1.11754C11.1016 1.18747 11.1571 1.27049 11.1949 1.36185C11.2328 1.45322 11.2522 1.55115 11.2522 1.65004C11.2522 1.74894 11.2328 1.84686 11.1949 1.93823C11.1571 2.02959 11.1016 2.11261 11.0317 2.18254L6.53166 6.68254C6.46158 6.75205 6.37847 6.80705 6.28709 6.84437C6.19571 6.88169 6.09787 6.90061 5.99916 6.90004Z"
                fill="#4B5675"
              />
            </svg>
          )}
        </div>
        {/* Dropdown Modal */}
        {isOpen && !disabled && (
          <div
            className={`absolute top-full left-0 w-full shadow-lg z-20 max-h-60 overflow-auto mt-1 bg-white border border-borderColor rounded-md`}
            onScroll={(e) => {
              if (!onLoadMore || !hasMore || loading) return;
              const target = e.currentTarget;
              const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
              if (nearBottom) {
                onLoadMore();
              }
            }}
          >
            {/* Search Input */}
            {showSearch && (
              <div className="p-2">
                <PInput
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearch(next);
                    onSearch?.(next);
                  }}
                  height="h-10"
                />
              </div>
            )}
            {/* Options */}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    if (option && option.value) {
                      onChange(valueIsObject ? JSON.stringify(option) : option.value);
                      setIsOpen(false);
                      setSearch('');
                    } else {
                      console.error('Invalid option:', option);
                    }
                  }}
                  className={`px-4 py-2 cursor-pointer text-sm hover:bg-primary-light flex items-center gap-2 `}
                >
                  {showIcon && (
                    <Icon
                      iconName={getCasinoCategoryIcon(option.label)}
                      svgProps={{ width: 20, height: 20 }}
                    />
                  )}
                  {option.label}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-gray-500">No results found</div>
            )}
            {loading && <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>}
          </div>
        )}

        {/* Error */}
      </div>
      {error && <span className="text-red-500 text-xs px-1 mt-2">{error.message}</span>}
    </>
  );
};

export default BSelectWithSearch;
