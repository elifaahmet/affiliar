import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ColDef } from 'ag-grid-community';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';

import { useTimezoneContext } from '../../../context/TimezoneContext';

import { getDefaultColDef } from './helper/getDefaultColDef';
import { getSideBarConfig } from './helper/getSideBarConfig';

import 'ag-grid-community/styles/ag-theme-quartz.css';
import '../../../index.css';

ModuleRegistry.registerModules([AllEnterpriseModule]);

interface PDataGridProps {
  showFooter?: boolean;
  colDefs: ColDef[];
  rowHeight?: number;
  paginationPageSize?: number;
  cacheBlockSize?: number;
  pinnedBottomRowData?: any;
  loading?: boolean;
  gridOptions?: any;
  gridRef?: any;
  onGridReady?: any;
  DetailCellRenderer?: any;
  grandRow?: any;
  onRowDragMove?: (event: any) => void;
  onRowDragEnter?: (event: any) => void;
  rowData?: any[];
  rowModelType?: 'clientSide' | 'infinite' | 'serverSide' | 'viewport';
  my?: string;
  rowDragManaged?: boolean;
  suppressMoveWhenRowDragging?: boolean;
  onRowDragEnd?: (event: any) => void;
  animateRows?: boolean;
  getRowId?: (params: any) => string;
  disableFilter?: boolean;
  getRowClass?: (params: any) => string;
  domLayout?: string;
}

export const PDataGrid = ({
  cacheBlockSize,
  colDefs,
  onGridReady,
  rowData,
  grandRow = undefined,
  gridRef,
  loading,
  rowModelType = 'clientSide',
  pinnedBottomRowData,
  gridOptions,
  rowHeight = 46,
  paginationPageSize = 20,
  DetailCellRenderer,
  showFooter = true,
  my = '10',
  // rowDragManaged = false,
  suppressMoveWhenRowDragging = false,
  onRowDragEnd,
  animateRows = false,
  onRowDragMove,
  onRowDragEnter,
  getRowId,
  disableFilter = false,
  getRowClass,
  ...rest
}: PDataGridProps) => {
  const internalGridRef = useRef<AgGridReact>(null);
  const gridInstanceRef = useMemo(() => gridRef ?? internalGridRef, [gridRef]);
  const { timezone } = useTimezoneContext();

  const detailCellRenderer = useCallback(
    (params: any) => {
      return <DetailCellRenderer params={params} />;
    },
    [DetailCellRenderer]
  );

  useEffect(() => {
    if (gridInstanceRef?.current?.api) {
      gridInstanceRef.current.api.refreshCells({ force: true });
    }
  }, [gridInstanceRef, timezone]);
  const detailCellRendererParams = {};
  const loadingOverlayTemplate = `
  <div class="flex items-center justify-center h-full">
    <div class="loader ease-linear rounded-full border-4 border-t-4 border-transparent border-t-[#8b5cf6] h-12 w-12"></div>
  </div>
`;

  return (
    <div style={{ width: '100%', height: '100%' }} className={`ag-theme-quartz ${my}`}>
      <AgGridReact
        enableCellTextSelection={true}
        rowHeight={rowHeight}
        cacheBlockSize={rowModelType === 'clientSide' ? cacheBlockSize : undefined}
        domLayout={'autoHeight' as any}
        rowData={rowData}
        headerHeight={35}
        rowClassRules={{
          'row-light': (params: any) => params.node.rowIndex % 2 === 0,
          'row-white': (params: any) => params.node.rowIndex % 2 !== 0,
        }}
        ref={gridInstanceRef}
        pinnedBottomRowData={pinnedBottomRowData}
        masterDetail={true}
        detailCellRenderer={detailCellRenderer}
        detailCellRendererParams={detailCellRendererParams}
        pagination={showFooter}
        loading={loading}
        overlayLoadingTemplate={loadingOverlayTemplate}
        overlayNoRowsTemplate={'<span class="ag-overlay-no-rows-center">No data available</span>'}
        rowModelType={rowModelType}
        grandTotalRow={grandRow}
        tooltipShowDelay={500}
        paginationPageSize={paginationPageSize}
        paginationPageSizeSelector={[5, 10, 20, 30, 40, 50]}
        embedFullWidthRows={true}
        columnDefs={colDefs}
        detailRowHeight={441}
        copyHeadersToClipboard={true}
        onGridReady={
          onGridReady
            ? onGridReady
            : () => {
                // grid is ready
              }
        }
        detailRowAutoHeight={true}
        gridOptions={gridOptions}
        onRowDragMove={onRowDragMove}
        onRowDragEnter={onRowDragEnter}
        onRowDragEnd={onRowDragEnd}
        defaultColDef={getDefaultColDef(disableFilter)}
        rowDragManaged={true}
        suppressMoveWhenRowDragging={suppressMoveWhenRowDragging}
        animateRows={animateRows}
        getRowId={getRowId}
        getRowClass={getRowClass}
        sideBar={getSideBarConfig(disableFilter)}
        {...rest}
      />
    </div>
  );
};
