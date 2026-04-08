import React from 'react';

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
        className="appearance-none bg-gray-100 border border-gray-300 text-sm font-semibold text-gray-700 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-500 text-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="7"
          viewBox="0 0 12 7"
          fill="none"
        >
          <path
            d="M5.51904 5.96285L5.51904 5.96285L5.52025 5.96393C5.65522 6.08372 5.81681 6.15 6 6.15C6.18047 6.15 6.34957 6.0855 6.48177 5.96211L10.9509 1.91383L10.9509 1.91385L10.953 1.91197C11.0789 1.79357 11.15 1.64236 11.15 1.46524C11.15 1.10635 10.842 0.85 10.4758 0.85C10.2966 0.85 10.1301 0.913514 10.0052 1.0178L10.0051 1.01771L10.0006 1.02184L6 4.65225L1.99942 1.02184L1.99951 1.02175L1.99478 1.0178C1.87053 0.914018 1.70996 0.85 1.52419 0.85C1.158 0.85 0.85 1.10635 0.85 1.46523C0.85 1.64282 0.921547 1.79528 1.05535 1.9143C1.05555 1.91448 1.05576 1.91466 1.05596 1.91485L5.51904 5.96285Z"
            fill="#CECCE4"
            stroke="#CECCE4"
            strokeWidth="0.3"
          />
        </svg>
      </span>
    </div>
  );
}

export default TimezoneSelect;
