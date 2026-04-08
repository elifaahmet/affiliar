import { ColDef } from 'ag-grid-enterprise';

export function getDefaultColDef(disableFilter: boolean): ColDef {
  return {
    suppressAutoSize: true,
    suppressSizeToFit: true,
    filter: disableFilter ? false : 'agTextColumnFilter',
    sortable: disableFilter ? false : true,
    menuTabs: disableFilter ? [] : undefined,
    floatingFilter: disableFilter ? false : true,
    filterParams: (params: { colDef: ColDef }) => {
      if (params.colDef.filter === 'agNumberColumnFilter') {
        return {
          defaultOption: 'greaterThanOrEqual',
          numberParser: (text: string) => {
            return parseFloat(text?.replace(',', '.'));
          },
        };
      }
      return {};
    },
  };
}
