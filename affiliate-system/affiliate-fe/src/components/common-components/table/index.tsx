import React from 'react';
import Icon from '@components/core-components/icon';

/** For generic mode: flexible cell value */
type CellValue =
  | React.ReactNode
  | string
  | number
  | { value: React.ReactNode | string | number; change: string };

/** Generic row and column types */
export type TableRow = Record<string, CellValue>;
export interface TableColumn {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

/** Legacy prop interface (still supported) */
interface LegacyTableDataItem {
  type?: string;
  preMatch?: { value: string; change: string };
  live?: { value: string; change: string };
  rng?: { value: string; change: string };
  mixed?: { value: string; change: string };
  total?: { value: string; change: string };
  color?: string;
}

interface LegacyTableProps {
  headers?: string[];
  data?: LegacyTableDataItem[];
}

/** New generic interface */
interface GenericTableProps {
  columns?: TableColumn[];
  rows?: TableRow[];
  leadingKey?: string;
  zebra?: boolean;
  onRowClick?: (row: TableRow, index: number) => void;
}

/** Unified component props — supports both modes */
type TableComponentProps = LegacyTableProps & GenericTableProps;

/** Normalize any cell into { value, change } */
function normalizeCell(cell: CellValue): { value: React.ReactNode; change?: string } {
  if (cell && typeof cell === 'object' && 'value' in cell) {
    const c = cell as { value: React.ReactNode; change?: string };
    return { value: c.value, change: c.change };
  }
  return { value: cell as React.ReactNode, change: undefined };
}

const alignClass = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

/**
 * Generic + Legacy compatible Table Component
 *
 * - If `columns` and `rows` props are passed, renders in **generic mode**.
 * - If only `headers` and `data` are passed, falls back to **legacy mode** (for backward compatibility).
 * - When refactoring, prefer the generic mode going forward.
 */
const TableComponent: React.FC<TableComponentProps> = ({
  // Legacy
  headers,
  data,
  // Generic
  columns,
  rows,
  leadingKey,
  zebra = true,
  onRowClick,
}) => {
  /** Cell renderer for both modes */
  const renderCell = (
    content: React.ReactNode,
    change?: string,
    emphasize?: boolean,
    align?: 'left' | 'center' | 'right'
  ) => (
    <td
      className={[
        'py-2 px-3 border-r border-[#F1F1F4] text-gray-900',
        emphasize ? 'font-medium' : 'font-bold',
        alignClass(align),
      ].join(' ')}
    >
      <div className="flex flex-col xl:flex-row items-start gap-2">
        {change === 'positive' && <Icon iconName="greenUp" svgProps={{ width: 21, height: 21 }} />}
        {change === 'negative' && <Icon iconName="redDown" svgProps={{ width: 21, height: 21 }} />}
        <span>{content}</span>
      </div>
    </td>
  );

  /** === MODE 1: GENERIC === */
  if (columns && rows) {
    const visibleColumns = leadingKey ? columns.filter((c) => c.key !== leadingKey) : columns;

    return (
      <div className="flex overflow-hidden">
        <table className="w-full overflow-hidden border border-[#F1F1F4]">
          <thead>
            <tr className="text-left bg-[#EEF2F4] h-10">
              {leadingKey && (
                <th className="text-sm font-bold text-gray-600 py-2 px-3">
                  {columns.find((c) => c.key === leadingKey)?.header ?? leadingKey}
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'text-sm font-bold text-gray-600 py-2 px-3',
                    alignClass(col.align),
                    col.headerClassName || '',
                  ].join(' ')}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="text-sm leading-4">
            {rows.map((row, index) => {
              const isLast = index === rows.length - 1;
              const bg = zebra ? (index % 2 === 0 ? 'bg-[#fff]' : 'bg-[#F8FAFF]') : 'bg-[#fff]';

              return (
                <tr
                  key={index}
                  className={[
                    'h-[46px]',
                    !isLast ? 'border-b border-borderColor' : '',
                    index === 0 ? 'border-t border-borderColor' : '',
                    bg,
                    onRowClick ? 'cursor-pointer hover:bg-[#f4f7ff]' : '',
                  ].join(' ')}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                >
                  {leadingKey &&
                    (() => {
                      const { value, change } = normalizeCell(row[leadingKey]);
                      return renderCell(value, change, true);
                    })()}
                  {visibleColumns.map((col) => {
                    const { value, change } = normalizeCell(row[col.key]);
                    return renderCell(value, change, col.bold, col.align);
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /** === MODE 2: LEGACY (unchanged behavior) === */
  return (
    <div className="flex overflow-hidden">
      <table className="w-full overflow-hidden border border-[#F1F1F4]">
        <thead>
          <tr className="text-left bg-[#EEF2F4] h-10">
            {headers?.map((header, index) => (
              <th key={index} className="text-sm font-bold text-gray-600 py-2 px-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-sm leading-4">
          {data?.map((row, index) => (
            <tr
              key={index}
              className={`h-[46px] ${
                index !== data.length - 1 ? 'border-b border-borderColor' : ''
              } ${index === 0 ? 'border-t border-borderColor' : ''} ${
                index % 2 === 0 ? 'bg-[#fff]' : 'bg-[#F8FAFF]'
              }`}
            >
              {row.type && renderCell(row.type, undefined, true)}
              {row.preMatch && renderCell(row.preMatch.value, row.preMatch.change)}
              {row.rng && renderCell(row.rng.value, row.rng.change)}
              {row.mixed && renderCell(row.mixed.value, row.mixed.change)}
              {row.live && renderCell(row.live.value, row.live.change)}
              {row.total && renderCell(row.total.value, row.total.change)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableComponent;
