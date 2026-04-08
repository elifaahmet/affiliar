import React, { ChangeEvent } from 'react';
import { FieldError } from 'react-hook-form';

interface BSelectOption {
  value: string;
  label: string;
}

interface BSelectProps {
  options: BSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  label?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  isMulti?: boolean;
  error?: FieldError;
  border?: boolean;
  id?: string;
  disabled?: boolean;
  name?: string;
  valueIsObject?: boolean;
}

const BSelect: React.FC<BSelectProps> = ({
  error,
  options = [],
  value,
  onChange,
  required = false,
  placeholder = 'Select an option',
  isMulti = false,
  className = '',
  border = true,
  id = '',
  disabled = false,
  defaultValue,
  name,
  valueIsObject,
}) => {
  const handleClick = () => {
    const selectElement = document.getElementById(id) as HTMLSelectElement;
    if (selectElement) {
      selectElement.click();
    }
  };
  return (
    <div
      className={`relative flex flex-col h-10 bg-gray-100 overflow-hidden rounded-md ${className} ${
        disabled ? 'border-gray-400 cursor-not-allowed opacity-50' : ''
      }`}
    >
      <div className="relative overflow-hidden bg-gray-100">
        {/* Floating Label */}
        <label
          htmlFor={id.length > 0 ? id : placeholder?.toLocaleLowerCase()?.replace(' ', '-')}
          onClick={handleClick}
          className={`absolute w-22 left-3 transform transition-all duration-200  max-w-[calc(100%-30px)] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer text-sm ${
            value || defaultValue
              ? 'top-1 text-xs font-medium text-gray-600'
              : 'top-1/2 -translate-y-1/2 font-medium text-gray-600'
          }`}
        >
          {placeholder}
        </label>

        <select
          id={id}
          value={value}
          defaultValue={defaultValue}
          multiple={isMulti}
          onChange={onChange}
          name={name}
          className={`peer h-10 bg-gray-100 overflow-hidden relative bg-transparent pt-3 px-3 w-full text-sm text-gray-900 appearance-none focus:outline-none rounded-md cursor-pointer
            ${border ? 'border border-[#A4D7FF] focus:ring-2 focus:ring-primary' : 'px-2'}
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
          required={required}
          disabled={disabled}
        >
          <option disabled value=""></option>
          {options?.map((option) => (
            <option
              key={option.value}
              value={valueIsObject ? JSON.stringify(option) : option?.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Dropdown Icon */}
        <div className="absolute inset-y-0 right-1 mt-3 overflow-hidden rounded flex items-center pointer-events-none">
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
      </div>

      {/* Error Message */}
      {error && <span className="text-red-500 text-xs px-1 mt-2">{error.message}</span>}
    </div>
  );
};

export default BSelect;
