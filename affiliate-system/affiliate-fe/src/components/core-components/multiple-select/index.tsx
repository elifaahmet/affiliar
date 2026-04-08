import React, { useEffect, useMemo, useRef, useState } from 'react';
import useDebounce from 'hooks/core/useDebounce';

import PInput from '../input';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  label?: string;
  options: Option[];
  value?: Option[];
  onChange?: (selected: Option[]) => void;
  classname?: string;
  allSelectedSummary?: string;
  disabled?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  label = 'Select Options',
  options = [],
  value = [],
  onChange,
  classname,
  disabled = false,
  allSelectedSummary,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Option[]>(value || []);
  const selectRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setSelected(value || []);
  }, [value]);

  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLowerCase().includes(debouncedSearch.toLowerCase())
      ),
    [debouncedSearch, options]
  );

  const toggleOption = (option: Option) => {
    setSelected((prev) => {
      let next: Option[];
      if (prev.find((item) => item.value === option.value)) {
        next = prev.filter((item) => item.value !== option.value);
      } else {
        next = [...prev, option];
      }
      onChange?.(next);
      return next;
    });
  };

  const removeOption = (val: string) => {
    setSelected((prev) => {
      const next = prev.filter((item) => item.value !== val);
      onChange?.(next);
      return next;
    });
  };

  const listForSelectAll = debouncedSearch ? filteredOptions : options;

  const isAllInListSelected =
    listForSelectAll.length > 0 &&
    listForSelectAll.every((o) => selected.some((s) => s.value === o.value));

  const handleToggleSelectAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isAllInListSelected) {
      const listValues = new Set(listForSelectAll.map((o) => o.value));
      setSelected((prev) => {
        const next = prev.filter((s) => !listValues.has(s.value));
        onChange?.(next);
        return next;
      });
    } else {
      const cur = new Map(selected.map((s) => [s.value, s]));
      listForSelectAll.forEach((o) => cur.set(o.value, o));
      const next = Array.from(cur.values());
      setSelected(next);
      onChange?.(next);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllOptionsSelected =
    options.length > 0 &&
    options.every((option) => selected.some((item) => item.value === option.value));

  const renderSelectedContent = () => {
    if (isAllOptionsSelected) {
      const summaryText = allSelectedSummary || `All selected`;
      return (
        <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{summaryText}</span>
      );
    }
    return selected.map((item) => (
      <span
        key={item.value}
        className="flex shrink-0 items-center gap-1 px-2 bg-blue-100 text-primary rounded-full text-xs"
      >
        {item.label}
        <button
          type="button"
          className="ml-1 text-primary hover:text-danger"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            removeOption(item.value);
          }}
        >
          ✕
        </button>
      </span>
    ));
  };

  return (
    <div
      ref={selectRef}
      className={`relative ${classname ? classname : 'w-full'} bg-gray-100 rounded-md border border-[#A4D7FF] cursor-pointer ${isOpen ? 'rounded-b-none' : ''}`}
    >
      <label
        className={`absolute left-3 transition-all text-sm cursor-pointer ${
          selected.length
            ? 'top-1 text-xs font-medium text-gray-600'
            : 'top-1/2 -translate-y-1/2 font-medium text-gray-600'
        }`}
        onClick={() => setIsOpen(true)}
      >
        {label}
      </label>
      <button
        type="button"
        className="absolute inset-y-0 right-1 mt-3 justify-center overflow-hidden rounded flex items-center cursor-pointer"
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
            d="M5.99916 6.90004c-.0987.00057-.19655-.01835-.28793-.05567a.749.749 0 0 1-.24457-.16183L.96666 2.18254A.749.749 0 0 1 .746094 1.65c0-.19973.07934-.39127.220569-.53246a.75.75 0 0 1 1.062001 0L5.99916 5.08504 9.96666 1.11754a.75.75 0 1 1 1.06504 1.065L6.53166 6.68254a.749.749 0 0 1-.5325.2175Z"
            fill="#4B5675"
          />
        </svg>
      </button>

      <div
        className="h-10 flex flex-nowrap gap-1 items-center pr-3 mr-8 pl-3 pt-5 pb-1 text-sm text-gray-900 overflow-x-auto overflow-y-hidden main-no-scrollbar::-webkit-scrollbar main-no-scrollbar"
        onClick={() => setIsOpen(!isOpen)}
      >
        {renderSelectedContent()}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full shadow-lg z-50 bg-white border border-borderColor rounded-b-md max-h-60 overflow-auto mt-1 main-no-scrollbar::-webkit-scrollbar main-no-scrollbar">
          <div className="px-2 pt-2 sticky top-0 bg-white z-10">
            <PInput
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              height="h-10"
            />
          </div>

          <div
            onClick={handleToggleSelectAll}
            className="px-4 py-2 cursor-pointer text-sm flex items-center gap-2 border-b hover:bg-gray-100 sticky top-12 bg-white z-10"
          >
            <input type="checkbox" checked={isAllInListSelected} readOnly />
            <span className="font-medium">
              Select all{debouncedSearch ? ' (filtered)' : ''}
              {debouncedSearch ? ` — ${filteredOptions.length}` : ` — ${options.length}`}
            </span>
          </div>

          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const checked = !!selected.find((s) => s.value === option.value);
              return (
                <div
                  key={option.value}
                  onClick={() => toggleOption(option)}
                  className={`px-4 py-2 cursor-pointer text-sm flex items-center gap-2 ${
                    checked ? 'bg-primary-light text-primary' : 'hover:bg-gray-100'
                  }`}
                >
                  <input type="checkbox" checked={checked} disabled={disabled} readOnly />
                  <span>{option.label}</span>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">No results found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
