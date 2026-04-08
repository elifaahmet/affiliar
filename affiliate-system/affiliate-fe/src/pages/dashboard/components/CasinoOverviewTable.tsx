import React from 'react';

interface CasinoOverviewTableProps {
  columns: { key: string; header: string }[];
  rows: {
    type: string;
    color?: string;
    live?: { value?: any };
    rng?: { value?: any };
    total?: { value?: any };
    [key: string]: any;
  }[];
}

function CasinoOverviewTable({ columns, rows }: CasinoOverviewTableProps) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
      <table className="w-full table-auto border-collapse">
        <thead className="bg-[#F8FAFB]">
          <tr style={{ borderBottom: '1px dashed #E3E5EC' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left font-bold text-sm"
                style={{ color: '#78829D' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderBottom: '1px dashed #E3E5EC' }}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-[4px] h-5 rounded-full"
                    style={{ backgroundColor: row.color || '#4F46E5' }}
                  />
                  <span className="text-sm font-medium" style={{ color: '#282A42' }}>
                    {row.type}
                  </span>
                </div>
              </td>

              {columns
                .filter((c) => c.key !== 'type')
                .map((col) => {
                  const cell = row[col.key];
                  const value = cell?.value ?? cell ?? '';

                  return (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-sm font-bold"
                      style={{ color: '#282A42' }}
                    >
                      {value}
                    </td>
                  );
                })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CasinoOverviewTable;
