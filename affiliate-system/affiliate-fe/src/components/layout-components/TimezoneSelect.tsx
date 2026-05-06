import React from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

import { useTimezoneContext } from '../../context/TimezoneContext';

function TimezoneSelect() {
  const { timezone, options, setTimezone } = useTimezoneContext();

  return (
    <div className="relative">
      <select
        value={timezone}
        onChange={(event) => {
          setTimezone(event.target.value);
        }}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-violet-100 bg-white/70 px-3 pr-8 text-xs font-semibold text-gray-700 backdrop-blur-sm transition-colors hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute inset-y-0 right-2 my-auto h-3.5 w-3.5 text-gray-400"
        aria-hidden="true"
      />
    </div>
  );
}

export default TimezoneSelect;
