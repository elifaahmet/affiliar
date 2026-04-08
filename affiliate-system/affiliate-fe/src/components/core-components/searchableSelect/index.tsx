import React, { useEffect, useRef, useState } from 'react';
import { FieldError } from 'react-hook-form';

interface BSelectOption {
  value: string;
  label: string;
}

interface BSelectProps {
  options: BSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  error?: FieldError;
  id?: string;
}

const SearchableSelect: React.FC<BSelectProps> = ({
  error,
  options = [],
  value,
  onChange,
  // required = false,
  placeholder = 'Select an option',
  className = '',
  // id = '',
}) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  useEffect(() => {
    setSearch(value ? options.find((opt) => opt.value === value)?.label || '' : '');
  }, [value, options]);
  return (
    <div ref={dropdownRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full h-10 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm"
        />
        <div
          className="absolute right-2 top-4 flex items-center  cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
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
      {isOpen && (
        <ul className="absolute z-10 w-full bg-white border rounded-lg shadow-md mt-1 max-h-40 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <li
                key={option.value}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                  value === option.value ? 'bg-gray-200' : ''
                }`}
                onClick={() => {
                  onChange(option.value);
                  setSearch(option.label);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-gray-500">No options found</li>
          )}
        </ul>
      )}
      {error && <span className="text-red-500 text-xs mt-1">{error.message}</span>}
    </div>
  );
};

export default SearchableSelect;
