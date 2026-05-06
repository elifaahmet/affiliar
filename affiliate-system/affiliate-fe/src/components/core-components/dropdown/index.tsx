import React, { useEffect, useRef, useState } from 'react';
import cx from 'classnames';

import Icon from '../icon';

interface BSelectOption {
  value: string;
  label: string;
}

interface BSelectProps {
  options: BSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className: string;
  dropDownlistClassNames: string;
}

const PIDropDown: React.FC<BSelectProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  className,
  dropDownlistClassNames,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(value || null);
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  const handleOptionClick = (option: BSelectOption) => {
    setSelectedOption(option.value);
    setIsOpen(false);
    onChange(option.value);
  };

  return (
    <div className={`${className}`} ref={dropdownRef}>
      <button
        id="custom-dropdown"
        onClick={toggleDropdown}
        disabled={disabled}
        className={`relative min-w-6 min-h-6 h-full text-left cursor-pointer rounded-md border flex items-center justify-center
          ${
            disabled
              ? 'bg-gray-200 cursor-not-allowed border-gray-300 text-gray-500'
              : 'bg-white border-gray-300 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
          }
        `}
      >
        <Icon
          iconName="downArrow"
          iconclass={`h-5 w-5 pointer-events-none ${disabled ? 'text-gray-400' : 'text-gray-500'}`}
        />
      </button>

      {isOpen && !disabled && (
        <div
          style={{
            boxShadow: '0px 8px 12px 1px rgba(0, 0, 0, 0.25)',
          }}
          className={`${dropDownlistClassNames} absolute z-10 bg-gray-200 rounded-[10px]`}
        >
          <ul className="max-h-64 w-full bg-white rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none divide-y divide-gray-300">
            {options.map((option, index) => (
              <li
                key={index}
                className={cx(
                  'flex flex-row h-[50px] justify-between px-6 items-center text-gray-900 text-body-reg-14 font-medium cursor-pointer select-none relative hover:bg-gray-100 whitespace-nowrap overflow-hidden text-ellipsis ',
                  {
                    'text-primary': option.label === selectedOption,
                  }
                )}
                onClick={() => handleOptionClick(option)}
              >
                {option.label}
                {option.label === selectedOption && (
                  <Icon iconName="selected" svgProps={{ height: 20, width: 20 }} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PIDropDown;
