import Icon from '@components/core-components/icon';
import Switch from '@components/core-components/switch';
import { ColDef, ICellRendererParams, ValueGetterParams } from 'ag-grid-enterprise';

export const customStyles = {
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
interface CommonColDefParams {
  headerName: string;
  field: string;
  filterType?: string;
  minWidth?: number;
  floatingFilter?: boolean;
  valueGetter?: (params: ValueGetterParams) => any;
  cellRenderer?: (params: ICellRendererParams) => string | HTMLElement;
  additionalCellStyle?: React.CSSProperties | ((params: any) => React.CSSProperties);
}

export const getCommonColDef = ({
  headerName,
  field,
  filterType = 'agTextColumnFilter',
  minWidth = 150,
  floatingFilter = true,
  valueGetter = undefined,
  cellRenderer = undefined,
  additionalCellStyle = {},
}: CommonColDefParams): ColDef => ({
  headerName,
  field,
  minWidth,
  flex: 1,
  filter: filterType,
  floatingFilter,
  cellRenderer,
  cellStyle: (params: any) => ({
    ...customStyles,
    ...(typeof additionalCellStyle === 'function'
      ? additionalCellStyle(params)
      : additionalCellStyle),
  }),
  ...(valueGetter !== undefined && { valueGetter }),
});

interface EnableColumnParams {
  handleSwitchToggle: (rowIndex: number) => void;
  canGeneralLimitEdit: boolean;
  togglingId?: string | null;
}

export const getEnableColumn = ({
  handleSwitchToggle,
  canGeneralLimitEdit,
  togglingId,
}: EnableColumnParams): ColDef => ({
  headerName: 'Enable',
  field: 'isEnabled',
  minWidth: 150,
  flex: 1,
  filter: 'agSetColumnFilter',
  floatingFilter: true,
  cellStyle: {
    ...customStyles,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellRenderer: (params: any) => {
    const isLoading = params.data._id === togglingId;
    return (
      <Switch
        isActive={params.data.isEnabled}
        onToggle={() => handleSwitchToggle(params.node?.rowIndex)}
        disabled={!canGeneralLimitEdit || isLoading}
        isLoading={isLoading}
      />
    );
  },
  valueGetter: (params: ValueGetterParams) =>
    params.data.isEnabled === true ? 'Yes' : params.data.isEnabled === false ? 'No' : '-',
});

interface ToolsColumnParams {
  setModalParams: ((params: ICellRendererParams) => void) | undefined;
  setIsModalOpen: (isOpen: boolean) => void;
  canEdit: boolean;
  canDelete: boolean;
  handleDelete?: (params: ICellRendererParams) => void;
  isModalOpen?: boolean;
  handleCloseModal?: () => void;
}

export const getToolsColumn = ({
  canEdit,
  canDelete,
  handleDelete,
}: ToolsColumnParams): ColDef => ({
  headerName: 'Tools',
  field: 'tools',
  sortable: false,
  filter: false,
  minWidth: 120,
  flex: 1,
  cellStyle: {
    ...customStyles,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellRenderer: (params: ICellRendererParams) => (
    <div className="flex flex-row gap-4 justify-center items-center">
      {canEdit ? (
        <Icon
          onClick={() => {
            params.api.forEachNode((node) => {
              if (node.id === params.node.id) {
                node.setExpanded(!node.expanded);
              } else {
                node.setExpanded(false);
              }
            });
            const rowElement = document.querySelector(
              `.ag-row[row-id="${params.node.id}"]`
            ) as HTMLElement;

            if (rowElement) {
              rowElement.scrollLeft = 0;
              rowElement
                .closest('.ag-center-cols-viewport')
                ?.scrollTo({ left: 0, behavior: 'smooth' });
            }
          }}
          iconName="editBlue"
          svgProps={{ width: 20, height: 20 }}
          className="cursor-pointer"
        />
      ) : (
        <div className="flex items-center justify-center cursor-not-allowed opacity-50">
          <Icon
            iconName="editBlue"
            svgProps={{ width: 20, height: 20 }}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      )}
      {canDelete ? (
        <Icon
          onClick={() => handleDelete && handleDelete(params)}
          iconName="trashRed"
          svgProps={{ width: 20, height: 20 }}
          className="cursor-pointer"
        />
      ) : (
        <div className="flex items-center justify-center cursor-not-allowed opacity-50">
          <Icon
            iconName="trashRed"
            svgProps={{ width: 20, height: 20 }}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      )}
    </div>
  ),
});

export interface GeneralColDefProps {
  canGeneralLimitEdit: boolean;
  handleSwitchToggle: (rowIndex: number) => void;
  handleDelete?: (params: ICellRendererParams) => void;
  setModalParams: (params: ICellRendererParams) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  canGeneralLimitDelete: boolean;
  togglingId: string | null;
}
