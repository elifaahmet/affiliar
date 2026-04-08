import React, { useEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import dayjs from 'dayjs';

import Icon from '../icon';

import 'react-datepicker/dist/react-datepicker.css';

type DateRangePickerProps = {
  value: [Date | null, Date | null];
  setValue: (dates: [Date | null, Date | null]) => void;
  label?: string;
  changeActiveTab?: any;
  position?: string;
  labelsData?: any;
  isSingleDateView?: boolean;
  top?: string;
  showCustomOnly?: boolean;
  limitMax?: boolean;
};
const today = new Date();
today.setHours(0, 0, 0, 0);
export const presetOptions = [
  {
    label: 'Today',
    getRange: () => [new Date(today), new Date(today)],
  },
  {
    label: 'Yesterday',
    getRange: () => {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return [yesterday, yesterday];
    },
  },
  {
    label: 'Last 7 Days',
    getRange: () => {
      const start = new Date(today);
      start.setDate(today.getDate() - 6); // today + 6 previous days
      return [start, new Date(today)];
    },
  },
  {
    label: 'Last 30 Days',
    getRange: () => {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return [start, new Date(today)];
    },
  },
  {
    label: 'This Month',
    getRange: () => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return [start, new Date(today)];
    },
  },
  {
    label: 'Custom',
    getRange: () => [null, null],
  },
];
const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  setValue,
  label,
  changeActiveTab,
  position,
  labelsData,
  isSingleDateView,
  top,
  showCustomOnly = false,
  limitMax = true,
}) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(showCustomOnly || false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, endDate] = value;
  const limitProps = limitMax ? { maxDate: new Date() } : {};

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOptionClick = (optionLabel: string) => {
    const selected = presetOptions.find((p) => p.label === optionLabel);
    if (!selected) return;
    if (optionLabel === 'Custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      setValue(selected.getRange() as [Date | null, Date | null]);
      if (labelsData) {
        const labelMap: Record<string, string> = {
          [presetOptions[2]?.label]: labelsData[3]?.label,
          [presetOptions[3]?.label]: labelsData[5]?.label,
          [presetOptions[4]?.label]: labelsData[4]?.label,
        };

        const label = labelMap[optionLabel] || optionLabel;

        const matchingTab = labelsData.find((item: any) => item.label === label);
        if (matchingTab && matchingTab.value?.startDate && matchingTab.value?.endDate) {
          changeActiveTab?.(matchingTab);
        }
      }

      setDropdownOpen(false);
    }
  };

  const isSelectedPreset = (range: [Date | null, Date | null]) => {
    if (!startDate && !endDate) return false;
    return (
      startDate?.toDateString() === range[0]?.toDateString() &&
      endDate?.toDateString() === range[1]?.toDateString()
    );
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div
        className="flex border h-10 items-center justify-between bg-gray-100 border-[#A4D7FF] rounded-md px-3 py-2 cursor-pointer"
        onClick={() => setDropdownOpen(!isDropdownOpen)}
      >
        <span
          className={`text-sm font-medium ${
            startDate && endDate ? 'text-gray-900' : 'text-gray-600'
          }`}
        >
          {startDate && endDate
            ? isSingleDateView
              ? dayjs(startDate).format('DD/MM/YY')
              : `${dayjs(startDate).format('DD/MM/YY')} - ${dayjs(endDate).format('DD/MM/YY')}`
            : label || 'Date Range'}
        </span>
        <Icon iconName="calendar" svgProps={{ width: '17px' }} />
      </div>

      {isDropdownOpen && (
        <div
          className={`flex flex-row gap-4 absolute  z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 ${
            showCustomPicker ? 'min-w-[400px]' : 'w-auto'
          } ${position === 'left' && 'right-[0]'}`}
          style={{
            top: top || 'none',
          }}
        >
          {!showCustomOnly && (
            <div className="flex flex-col w-full gap-1">
              {presetOptions.map((option, index) => {
                const isActive = isSelectedPreset(option.getRange() as [Date | null, Date | null]);
                return (
                  <React.Fragment key={option.label}>
                    {index === presetOptions.length - 1 && <hr className="my-2" />}
                    <div
                      className={`px-4 py-2 text-sm rounded-lg cursor-pointer w-full min-w-[120px] ${
                        isActive
                          ? 'bg-primary text-white'
                          : option.label === 'Custom' && showCustomPicker
                            ? 'bg-primary-light border border-primary text-primary'
                            : 'hover:bg-primary-light border border-gray-400 bg-gray-300'
                      }`}
                      onClick={() => handleOptionClick(option.label)}
                    >
                      {option.label}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {showCustomPicker && (
            <div className={`${!showCustomOnly && 'border-l pl-4'} `}>
              <div className="flex flex-col w-fit gap-2 bg-white">
                <div className="flex gap-2 items-center w-full">
                  <div className="flex items-center gap-2 border border-[#A4D7FF] px-2 py-1 rounded w-full h-9">
                    <Icon iconName="calendar" />
                    <input
                      type="text"
                      readOnly
                      placeholder="Start Date"
                      value={startDate ? dayjs(startDate).format('DD/MM/YY HH:mm') : ''}
                      className="outline-none text-sm bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2 border border-[#A4D7FF] px-2 py-1 rounded w-full h-9">
                    <Icon iconName="calendar" />
                    <input
                      type="text"
                      readOnly
                      placeholder="End Date"
                      value={endDate ? dayjs(endDate).format('DD/MM/YY HH:mm') : ''}
                      className="outline-none text-sm bg-transparent"
                    />
                  </div>
                </div>

                <div className="flex gap-2 items-center w-full">
                  <div className="flex items-center w-full gap-2 h-9">
                    <Icon
                      iconName="clock"
                      svgProps={{ width: 16, height: 16 }}
                      className="flex items-center justify-center self-center gap-1 bg-gray-300 border border-[#A4D7FF] rounded px-2 h-full w-9"
                    />
                    <select
                      value={startDate?.getHours() || 0}
                      onChange={(e) => {
                        const updated = new Date(startDate || new Date());
                        updated.setHours(Number(e.target.value));
                        setValue([updated, endDate]);
                        if (updated && endDate) {
                          changeActiveTab && changeActiveTab();
                        }
                      }}
                      className="bg-transparent outline-none flex items-center gap-1 border border-[#A4D7FF] px-2 py-1 rounded w-full h-full pr-6"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    :
                    <select
                      value={startDate?.getMinutes() || 0}
                      onChange={(e) => {
                        const updated = new Date(startDate || new Date());
                        updated.setMinutes(Number(e.target.value));
                        setValue([updated, endDate]);
                        if (updated && endDate) {
                          changeActiveTab && changeActiveTab();
                        }
                      }}
                      className="bg-transparent outline-none flex items-center gap-1 border border-[#A4D7FF] px-2 py-1 rounded w-full h-full pr-6"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center w-full gap-2 h-9">
                    <Icon
                      iconName="clock"
                      svgProps={{ width: 16, height: 16 }}
                      className="flex items-center justify-center self-center gap-1 bg-gray-300 border border-[#A4D7FF] rounded px-2 h-full w-9"
                    />
                    <select
                      value={endDate?.getHours() || 0}
                      onChange={(e) => {
                        const updated = new Date(endDate || new Date());
                        updated.setHours(Number(e.target.value));
                        setValue([startDate, updated]);
                        if (startDate && updated) {
                          changeActiveTab && changeActiveTab();
                        }
                      }}
                      className="bg-transparent outline-none flex items-center gap-1 border border-[#A4D7FF] px-2 rounded w-full h-full pr-6"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    :
                    <select
                      value={endDate?.getMinutes() || 0}
                      onChange={(e) => {
                        const updated = new Date(endDate || new Date());
                        updated.setMinutes(Number(e.target.value));
                        setValue([startDate, updated]);
                        if (startDate && updated) {
                          changeActiveTab && changeActiveTab();
                        }
                      }}
                      className="bg-transparent outline-none flex items-center gap-1 border border-[#A4D7FF] px-2 rounded w-full h-full pr-6"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4">
                  <DatePicker
                    selected={startDate || undefined}
                    onChange={(
                      dates: [Date | null, Date | null] | null,
                      _event: React.SyntheticEvent<any> | undefined
                    ) => {
                      const [start, end] = dates as [Date | null, Date | null];
                      setValue([start, end]);
                      if (start && end) {
                        changeActiveTab && changeActiveTab();
                      }
                    }}
                    startDate={startDate || undefined}
                    endDate={endDate || undefined}
                    selectsRange
                    minDate={new Date(2015, 0, 1)}
                    {...limitProps}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    inline
                    calendarClassName="custom-calendar"
                    dayClassName={(date) => {
                      const currentMonth = (startDate || new Date()).getMonth();
                      return date.getMonth() === currentMonth ? '' : 'hidden';
                    }}
                  />

                  <DatePicker
                    selected={endDate || null}
                    openToDate={
                      startDate
                        ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)
                        : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
                    }
                    onChange={(
                      dates: [Date | null, Date | null] | null,
                      _event: React.SyntheticEvent<any> | undefined
                    ) => {
                      const [start, end] = dates as [Date | null, Date | null];
                      setValue([start, end]);
                      if (start && end) {
                        changeActiveTab && changeActiveTab();
                      }
                    }}
                    startDate={startDate || undefined}
                    endDate={endDate || undefined}
                    selectsRange
                    minDate={
                      startDate
                        ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)
                        : new Date(2015, 0, 1)
                    }
                    {...limitProps}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    inline
                    calendarClassName="custom-calendar"
                    dayClassName={(date) => {
                      const currentMonth = (endDate || new Date()).getMonth();
                      return date.getMonth() === currentMonth ? '' : 'hidden';
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
