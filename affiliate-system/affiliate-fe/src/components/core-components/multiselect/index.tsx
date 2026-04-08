import React, { useEffect, useRef, useState } from 'react';

interface BSelectOption {
  value: string;
  label: string;
}

interface BMultiSelectProps {
  options: BSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  border?: boolean;
}

const BMultiSelect: React.FC<BMultiSelectProps> = ({
  options = [],
  selectedValues,
  onChange,
  placeholder = '',
  className = '',
  // required = false,
  border = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Toggle the dropdown
  const toggleDropdown = () => setIsOpen(!isOpen);

  // Close the dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectOption = (selectedValue: string) => {
    if (selectedValues.includes(selectedValue)) {
      onChange(selectedValues.filter((v) => v !== selectedValue));
    } else {
      onChange([...selectedValues, selectedValue]);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <div
          className={`${
            border
              ? 'bg-gray-100 border text-sm font-medium border-[#A4D7FF] pr-16 px-4 focus:ring-2 focus:ring-[#45A9EF]'
              : 'px-2 pr-5'
          } text-gray-700  text-sm h-11 flex items-center w-full bg-gray-100 rounded-md focus:outline-none cursor-pointer`}
          onClick={toggleDropdown}
        >
          {selectedValues.length > 0
            ? `${selectedValues.length} out of ${options.length} picked`
            : placeholder}
        </div>
        <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="7"
            viewBox="0 0 12 7"
            fill="none"
          >
            <path
              d="M5.99916 6.90004C5.90046 6.90061 5.80261 6.88169 5.71123 6.84437C5.61985 6.80705 5.53674 6.75205 5.46666 6.68254L0.966663 2.18254C0.896734 2.11261 0.841263 2.02959 0.803418 1.93823C0.765573 1.84686 0.746094 1.74894 0.746094 1.65004C0.746094 1.45031 0.825435 1.25877 0.966663 1.11754C1.10789 0.976313 1.29944 0.896973 1.49916 0.896973C1.69889 0.896973 1.89043 0.976313 2.03166 1.11754L5.99916 5.08504L9.96666 1.11754C10.0366 1.04761 10.1196 0.992141 10.211 0.954296C10.3023 0.916451 10.4003 0.896973 10.4992 0.896973C10.5981 0.896973 10.696 0.916451 10.7873 0.954296C10.8787 0.992141 10.9617 1.04761 11.0317 1.11754C11.1016 1.18747 11.1571 1.27049 11.1949 1.36185C11.2328 1.45322 11.2522 1.55115 11.2522 1.65004C11.2522 1.74894 11.2328 1.84686 11.1949 1.93823C11.1571 2.02959 11.1016 2.11261 11.0317 2.18254L6.53166 6.68254C6.46158 6.75205 6.37847 6.80705 6.28709 6.84437C6.19571 6.88169 6.09787 6.90061 5.99916 6.90004Z"
              fill="#4B5675"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-md max-h-60 overflow-y-auto">
          {options.map((option) => (
            <li
              key={option.value}
              onClick={() => handleSelectOption(option.value)}
              className="px-4 py-2 text-sm text-gray-700 cursor-pointer hover:bg-primary-light"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => handleSelectOption(option.value)}
                className="mr-2"
              />
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BMultiSelect;
