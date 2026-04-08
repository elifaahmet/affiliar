import { ColDef, ValueGetterParams } from 'ag-grid-enterprise';
import { getDateColDef } from 'utils/ag-grid/getDateColDef';

import {
  customStyles,
  GeneralColDefProps,
  getCommonColDef,
  getEnableColumn,
  getToolsColumn,
} from './helper';

export const getCategoryTabColDefs = ({
  canGeneralLimitEdit,
  handleSwitchToggle,
  setModalParams,
  setIsModalOpen,
  canGeneralLimitDelete,
  togglingId,
  handleDelete,
}: GeneralColDefProps): ColDef[] => [
  getCommonColDef({
    headerName: 'ID of Limit',
    field: '_id',
    filterType: 'agTextColumnFilter',
    minWidth: 220,
    valueGetter: (params: ValueGetterParams) => params.data._id || '-',
  }),
  getCommonColDef({
    headerName: 'Category',
    field: 'category',
    filterType: 'agTextColumnFilter',
    minWidth: 180,
    valueGetter: (params: ValueGetterParams) => params.data.category?.name || '-',
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
    minWidth: 150,
    valueGetter: (params: ValueGetterParams) => params.data.currency || '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Percent',
    field: 'percent',
    filterType: 'agNumberColumnFilter',
    minWidth: 150,
    valueGetter: (params: ValueGetterParams) => params.data.percent || '-',
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Is Verified',
    field: 'isVerified',
    filterType: 'agSetColumnFilter',
    minWidth: 150,
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
  getEnableColumn({ handleSwitchToggle, canGeneralLimitEdit, togglingId }),

  getToolsColumn({
    handleDelete,
    setModalParams,
    setIsModalOpen,
    canEdit: canGeneralLimitEdit,
    canDelete: canGeneralLimitDelete,
  }),
];
