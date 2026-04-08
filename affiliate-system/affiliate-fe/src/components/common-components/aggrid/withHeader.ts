import type { ColDef } from 'ag-grid-community';

import HeaderWithSubtitle from './HeaderWithSubtitle';

export type HeaderAlign = 'left' | 'center' | 'right';

export type ExtendedColDef = ColDef & {
  headerSubtitle?: string;
  headerAlign?: HeaderAlign;
  headerTitle?: string;
};

export const withHeader = <T extends ExtendedColDef>(cols: T[]): T[] =>
  cols.map((col) => ({
    ...col,
    headerComponent: HeaderWithSubtitle,
    headerComponentParams: {
      title: col.headerTitle ?? (typeof col.headerName === 'string' ? col.headerName : undefined),
      subtitle: col.headerSubtitle,
      align: col.headerAlign ?? 'left',
    },
  }));
