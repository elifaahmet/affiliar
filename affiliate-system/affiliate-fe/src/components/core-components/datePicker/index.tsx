import React from 'react';
import { FieldError } from 'react-hook-form';
import Datepicker, { DateValueType } from 'react-tailwindcss-datepicker';

import Icon from '../icon';

interface BDatePickerProps {
  value: DateValueType | null;
  onChange: (newDate: DateValueType | null) => void;
  label?: string;
  required?: boolean;
  className?: string;
  placeholder: string;
  showRange?: boolean;
  width?: string;
  disabled?: boolean;
  showShortcuts?: boolean;
  error?: FieldError;
  maxDate?: boolean;
  minDate?: Date;
  direction?: 'up' | 'down';
}

const BDatePicker: React.FC<BDatePickerProps> = ({
  value,
  placeholder,
  onChange,
  required = false,
  className = '',
  showRange = false,
  width = '100%',
  disabled = false,
  showShortcuts = true,
  error = null,
  maxDate = true,
  minDate,
  direction,
}) => {
  const handleChange = (selectedDate: DateValueType | null) => {
    onChange(selectedDate);
  };

  return (
    <div className={`relative flex flex-col ${className}`} style={{ width }}>
      <Datepicker
        displayFormat="DD MMM YYYY"
        placeholder={placeholder}
        useRange={showRange}
        asSingle={!showRange}
        showFooter={false}
        onChange={handleChange}
        showShortcuts={showShortcuts}
        disabled={disabled}
        maxDate={maxDate ? new Date() : undefined}
        minDate={minDate}
        toggleIcon={() => (
          <Icon
            svgProps={{
              width: '17px',
            }}
            iconName="calendar"
            className="right-3 items-center justify-center my-5 transform -translate-y-1/2 text-gray-600 pointer-events-none"
          />
        )}
        value={value === null ? { startDate: null, endDate: null } : value}
        required={required}
        inputClassName={`text-sm font-medium h-10 w-full border ${
          disabled
            ? 'bg-gray-100 border-gray-400 text-gray-500 opacity-50'
            : 'bg-gray-100 border-[#A4D7FF] text-gray-900'
        } rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary truncate`}
        containerClassName="w-full"
        popoverDirection={direction}
      />
      {error && <p className="mt-2 text-red-500 text-body-reg-12 font-medium">{error.message}</p>}
    </div>
  );
};

export default BDatePicker;
