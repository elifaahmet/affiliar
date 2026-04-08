import { Link } from 'react-router-dom';
import { ColDef, ICellRendererParams } from 'ag-grid-enterprise';

import { getCommonColDef } from './helper';

export const getPlayerLimitsTabColDefs = (): ColDef[] => [
  getCommonColDef({
    headerName: 'ID of Limit',
    field: 'idOfLimit',
    filterType: 'agTextColumnFilter',
    minWidth: 150,
  }),
  getCommonColDef({
    headerName: 'Category',
    field: 'category',
    filterType: 'agTextColumnFilter',
    minWidth: 180,
  }),
  {
    ...getCommonColDef({
      headerName: 'Username',
      field: 'username',
      filterType: 'agTextColumnFilter',
      minWidth: 150,
    }),
    cellRenderer: (params: ICellRendererParams) => (
      <Link to={`/players/list/detail/${params.data.userId}?tab=overview`}>
        <button className="text-primary underline">{params.data.username}</button>
      </Link>
    ),
  },
  getCommonColDef({
    headerName: 'Provider',
    field: 'provider',
    filterType: 'agTextColumnFilter',
    minWidth: 150,
  }),
  getCommonColDef({
    headerName: 'Game',
    field: 'game',
    filterType: 'agTextColumnFilter',
    minWidth: 200,
  }),
  getCommonColDef({
    headerName: 'Game ID',
    field: 'gameId',
    filterType: 'agTextColumnFilter',
    minWidth: 120,
  }),
  getCommonColDef({
    headerName: 'Amount',
    field: 'amountOrPercent',
    filterType: 'agNumberColumnFilter',
    minWidth: 150,
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Currency',
    field: 'currency',
    filterType: 'agSetColumnFilter',
    minWidth: 150,
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  getCommonColDef({
    headerName: 'Period Type',
    field: 'period',
    filterType: 'agSetColumnFilter',
    minWidth: 150,
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  // getCommonColDef({
  //   headerName: 'Is Blocked',
  //   field: 'blocked',
  //   filterType: 'agSetColumnFilter',
  //   minWidth: 150,
  //   additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  // }),
  getCommonColDef({
    headerName: 'Is Enabled',
    field: 'isEnabled',
    filterType: 'agSetColumnFilter',
    minWidth: 150,
    additionalCellStyle: { justifyContent: 'center', alignItems: 'center' },
  }),
  // getToolsColumn(
  //   {
  //     setModalParams: undefined,
  //     setIsModalOpen,
  //     canEdit: canPlayerLimitEdit,
  //     canDelete: canPlayerLimitDelete,
  //     isModalOpen,
  //     handleCloseModal,
  //   },
  // true
  // ),
];
