import StatusChip from '@components/common-components/chip/StatusChip';
import { ColDef, ICellRendererParams, ValueGetterParams } from 'ag-grid-enterprise';
import { getDateColDef } from 'utils/ag-grid/getDateColDef';

import { customStyles, getCommonColDef } from './helper';

export const getPriorityTabColDefs = ({
  canGeneralLimitEdit,
}: {
  canGeneralLimitEdit: boolean;
}): ColDef[] => [
  {
    headerName: 'Priority',
    field: 'priority',
    rowDrag: (params: any) => canGeneralLimitEdit && !params.data?.isPlaceholder,
    minWidth: 100,
    maxWidth: 100,
    flex: 1,
    cellStyle: {
      ...customStyles,
    },
    cellRenderer: (params: any) => (
      <div className="flex flex-row items-start justify-start ml-2">
        <div className="flex w-full min-w-[49px] h-[46px] bg-gray-400 items-center justify-center border-b border-l border-[#f1f1f4]">
          <span>{params.node.rowIndex + 1}</span>
        </div>
      </div>
    ),
  },
  getCommonColDef({
    headerName: 'ID of Limit',
    field: '_id',
    filterType: 'agTextColumnFilter',
    floatingFilter: true,
    minWidth: 120,
    valueGetter: (params: ValueGetterParams) => params.data._id || '-',
  }),
  {
    ...getCommonColDef({
      headerName: 'Limited By',
      field: 'limitedBy',
      filterType: 'agSetColumnFilter',
      minWidth: 150,
      valueGetter: (params: ValueGetterParams) => params.data.limitedBy || '-',
    }),
    cellRenderer: (params: ICellRendererParams) => (
      <StatusChip
        status={params.value?.charAt(0).toUpperCase() + params.value?.slice(1).toLowerCase()}
      />
    ),
  },
  getCommonColDef({
    headerName: 'Category',
    field: 'category',
    filterType: 'agTextColumnFilter',
    minWidth: 180,
    valueGetter: (params: ValueGetterParams) => params.data.category?.name || '-',
    additionalCellStyle: (params) => ({
      opacity: params.data.limitedBy === 'game' ? 0.5 : 1,
    }),
  }),

  getCommonColDef({
    headerName: 'Provider',
    field: 'provider',
    filterType: 'agTextColumnFilter',
    minWidth: 180,
    valueGetter: (params: ValueGetterParams) => params.data.provider?.name || '-',
    additionalCellStyle: (params) => ({
      opacity: params.data.limitedBy === 'game' ? 0.5 : 1,
    }),
  }),
  getCommonColDef({
    headerName: 'Game',
    field: 'game',
    filterType: 'agTextColumnFilter',
    minWidth: 180,
    valueGetter: (params: ValueGetterParams) => params.data.game?.game_name || '-',
  }),
  getCommonColDef({
    headerName: 'Game ID',
    field: 'game',
    filterType: 'agTextColumnFilter',
    minWidth: 120,
    valueGetter: (params: ValueGetterParams) => params.data.game?.id || '-',
  }),
  getCommonColDef({
    headerName: 'Amount',
    field: 'amount',
    filterType: 'agNumberColumnFilter',
    minWidth: 150,
    valueGetter: (params: ValueGetterParams) => params.data.amount || '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Currency',
    field: 'currency',
    filterType: 'agSetColumnFilter',
    minWidth: 120,
    valueGetter: (params: ValueGetterParams) => params.data.currency || '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Percent',
    field: 'percent',
    filterType: 'agNumberColumnFilter',
    minWidth: 100,
    valueGetter: (params: ValueGetterParams) => params.data.percent || '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Is Verified',
    field: 'isVerified',
    filterType: 'agSetColumnFilter',
    minWidth: 120,
    valueGetter: (params: ValueGetterParams) =>
      params.data.isVerified === true ? 'Yes' : params.data.isVerified === false ? 'No' : '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Note',
    field: 'note',
    filterType: 'agTextColumnFilter',
    minWidth: 200,
    valueGetter: (params: ValueGetterParams) => params.data.note || '-',
  }),
  getCommonColDef({
    headerName: 'Changed By',
    field: 'changedBy',
    filterType: 'agSetColumnFilter',
    minWidth: 200,
    valueGetter: (params: ValueGetterParams) => params.data.changedBy?.email || '-',
  }),
  getDateColDef('createdAt', 'Created', {
    minWidth: 180,
    format: 'DD/MM/YYYY - HH:mm',
    cellStyle: customStyles,
  }),
  getDateColDef('updatedAt', 'Updated', {
    minWidth: 180,
    format: 'DD/MM/YYYY - HH:mm',
    cellStyle: customStyles,
  }),
];
