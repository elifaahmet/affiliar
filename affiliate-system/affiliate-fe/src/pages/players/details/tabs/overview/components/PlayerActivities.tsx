import React from 'react';
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';

const PlayerActivities = () => {
  const currentYear = new Date().getFullYear();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const generateMonthlyData = (year: number, month: number) => {
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));
    const daysBetween = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return Array.from({ length: daysBetween + 1 }, (_, index) => {
      const date = addDays(startDate, index);
      return {
        date: format(date, 'dd-MM-yyyy'),
        count: Math.random() > 0.3 ? Math.floor(Math.random() * 4) : 0,
      };
    });
  };

  const getColorClass = (count: number) => {
    if (count === 0) return 'bg-gray-300';
    if (count === 1) return 'bg-yellow';
    if (count === 2) return 'bg-success-light';
    return 'bg-success';
  };

  const handleClick = (_date: string) => {
    //
  };

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full w-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col px-5 py-6">
        <div className="flex flex-row justify-between items-center pb-2">
          <span className="text-base font-extrabold text-gray-900">Activity 🚫</span>
        </div>

        <div className="flex flex-wrap gap-10 mt-4">
          {months.map((month, index) => (
            <div key={month} className="flex flex-col items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{month}</span>
              <div className="grid grid-cols-5 gap-0.5">
                {generateMonthlyData(currentYear, index).map((value, idx) => (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-sm ${getColorClass(value.count)}`}
                    title={`${value.date}: ${value.count} activity`}
                    onClick={() => handleClick(value.date)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlayerActivities;
