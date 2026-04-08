import { ColDef, ValueFormatterParams } from 'ag-grid-enterprise';
import { convertDateToTimezone, formatDateWithTimezone } from 'utils/timezone';

const customStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  whiteSpace: 'wrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: '#282A42',
  fontSize: '14px',
  lineHeight: '18px',
  fontWeight: '500',
};

type PartialColDef = Partial<ColDef>;

interface GetDateColDefOptions extends PartialColDef {
  format?: string;
}

export const getDateColDef = (
  field: string,
  headerName: string,
  options: GetDateColDefOptions = {}
): ColDef => {
  const { format = 'DD/MM/YYYY', ...overrides } = options;

  return {
    headerName,
    field,
    filter: 'agDateColumnFilter',
    valueGetter: (params) => params.data?.[field] ?? null,
    valueFormatter: (params: ValueFormatterParams) =>
      params.value ? formatDateWithTimezone(params.value, format) : '-',
    filterParams: {
      browserDatePicker: true,
      comparator: (filterLocalDateAtMidnight: Date, cellValue: any) => {
        if (!cellValue) return -1;
        const cellDate = convertDateToTimezone(cellValue);
        if (!cellDate) return -1;

        const filterDate = convertDateToTimezone(filterLocalDateAtMidnight);
        if (!filterDate) return -1;

        const cellTime = cellDate.startOf('day').valueOf();
        const filterTime = filterDate.startOf('day').valueOf();

        return cellTime < filterTime ? -1 : cellTime > filterTime ? 1 : 0;
      },
    },
    floatingFilter: true,
    autoHeight: true,
    flex: 1,
    minWidth: 150,
    headerClass: 'ag-header-cell-left',
    cellStyle: {
      ...customStyles,
    },
    ...overrides,
  };
};
