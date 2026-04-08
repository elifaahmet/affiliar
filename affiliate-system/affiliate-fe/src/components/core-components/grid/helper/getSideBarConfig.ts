import type { SideBarDef, ToolPanelDef } from 'ag-grid-community';

export const getSideBarConfig = (disableFilter: boolean): SideBarDef => {
  const toolPanels: ToolPanelDef[] = [
    {
      id: 'columns',
      labelDefault: 'Columns',
      labelKey: 'columns',
      iconKey: 'columns',
      toolPanel: 'agColumnsToolPanel',
      toolPanelParams: {
        suppressRowGroups: true,
        suppressValues: true,
        suppressPivots: true,
        suppressPivotMode: true,
      },
    },
  ];

  if (!disableFilter) {
    toolPanels.push({
      id: 'filters',
      labelDefault: 'Filters',
      labelKey: 'filters',
      iconKey: 'filter',
      toolPanel: 'agFiltersToolPanel',
    });
  }

  return {
    toolPanels,
    // defaultToolPanel: 'columns',
  };
};
