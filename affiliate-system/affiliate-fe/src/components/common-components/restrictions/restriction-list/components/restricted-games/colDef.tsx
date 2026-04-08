import React from 'react';
import Icon from '@components/core-components/icon';
import { ColDef } from 'ag-grid-enterprise';

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

interface GetColDefsProps {
  canDelete?: boolean;
  handleDelete?: (id: string) => void;
}

export const getRestrictedGamesColDef = ({
  canDelete = false,
  handleDelete,
}: GetColDefsProps): ColDef[] => [
  {
    headerName: 'Provider',
    field: 'provider',
    minWidth: 180,
    flex: 1,
    autoHeight: true,
    cellStyle: customStyles,
  },
  {
    headerName: 'Game',
    field: 'game_name',
    minWidth: 180,
    flex: 1,
    autoHeight: true,
    cellStyle: customStyles,
  },

  {
    headerName: 'Tools',
    field: 'tools',
    maxWidth: 100,
    flex: 1,
    cellStyle: {
      ...customStyles,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cellRenderer: (params: { value?: { name: string }[]; data: { _id: string } }) => {
      return (
        <div className="flex flex-row gap-4 justify-center items-center">
          {canDelete ? (
            <Icon
              onClick={() => handleDelete && handleDelete(params.data._id)}
              iconName="cancelCloseGray"
              svgProps={{ width: 20, height: 20 }}
              className="cursor-pointer"
            />
          ) : (
            <div className="flex items-center justify-center cursor-not-allowed opacity-50">
              <Icon
                iconName="cancelCloseGray"
                svgProps={{ width: 20, height: 20 }}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          )}
        </div>
      );
    },
  },
];
