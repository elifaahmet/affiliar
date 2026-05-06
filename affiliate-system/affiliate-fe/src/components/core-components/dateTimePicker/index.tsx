import React, { useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import dayjs from 'dayjs';

import Icon from '../icon';
import BSelect from '../select';

import 'react-datepicker/dist/react-datepicker.css';

type DateTimePickerProps = Readonly<{
  value: string;
  label: string;
  setValue: (date: string) => void;
  options: { label: string; value: string }[];
  selectValue: string;
  setSelectValue: (value: string) => void;
  withTime?: boolean;
  limitFutureDays?: boolean;
}>;

function DateTimePicker({
  value,
  setValue,
  label,
  options,
  selectValue,
  limitFutureDays = false,
  setSelectValue,
  withTime = true,
}: DateTimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleDateChange = (date: Date | null) => {
    if (date) {
      let formattedDate = '';
      if (withTime) {
        formattedDate = dayjs(date).format('YYYY-MM-DD HH:mm:ss.SSS');
        setIsCalendarOpen(false);
      } else {
        formattedDate = dayjs(date).format('YYYY-MM-DD');

        setIsCalendarOpen(false);
      }
      setValue(formattedDate);
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectValue(e.target.value);
    setIsCalendarOpen(true);
  };

  const handleIconClick = () => {
    setIsCalendarOpen(true);
  };

  const handleInputFocus = () => {
    setIsCalendarOpen(true);
  };

  const handleCalendarClose = () => {
    setIsCalendarOpen(false);
  };

  return (
    <div className="flex h-10 border border-[#C4B5FD] items-center bg-gray-100 rounded-md z-40">
      <BSelect
        id={label.toLocaleLowerCase().replace(' ', '_')}
        border={false}
        placeholder={label}
        options={options}
        value={selectValue}
        onChange={handleSelectChange}
        className="h-9 bg-transparent text-sm pr-0 m-0 w-1/2 border-0 focus:outline-none"
      />
      <div className="border-r h-10 border-[#C4B5FD]"></div>
      <div className="flex items-center h-10 w-1/2 relative">
        <DatePicker
          selected={value ? new Date(value) : null}
          onChange={handleDateChange}
          showTimeSelect={withTime} // Show time picker only if withTime is true
          timeFormat="HH:mm"
          timeIntervals={15}
          popperClassName="z-50"
          dateFormat={withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'}
          className="text-gray-700  h-10 bg-gray-100 text-sm border-none w-full px-1 py-2 focus:outline-none"
          placeholderText="dd/mm/yyyy"
          calendarClassName={`flex flex-row-reverse items-center justify-between ${
            withTime ? 'w-[328px]' : 'w-58'
          } bg-gray-100`}
          showYearDropdown={true}
          showMonthDropdown={true}
          scrollableYearDropdown
          maxDate={limitFutureDays ? new Date() : undefined}
          yearDropdownItemNumber={100}
          customInput={
            <input className="bg-transparent pr-1 z-40" ref={inputRef} onFocus={handleInputFocus} />
          }
          open={isCalendarOpen}
          onClickOutside={handleCalendarClose}
        />

        <Icon
          iconName="calendar"
          onClick={handleIconClick}
          svgProps={
            {
              // height: "30px",
            }
          }
          className="ml-0 bg-white h-[25px] w-[20px] px-0 absolute cursor-pointer right-[5px] top-[7px] flex items-center justify-center"
        />
      </div>
    </div>
  );
}

export default DateTimePicker;
