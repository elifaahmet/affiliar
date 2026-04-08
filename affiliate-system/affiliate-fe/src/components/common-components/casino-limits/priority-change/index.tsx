import { useEffect, useMemo } from 'react';
import { PDataGrid } from '@components/core-components/grid/PDataGrid';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { useAppSelector } from 'hooks/redux';

import { getPriorityTabColDefs } from '../limits-list/colDefs/priorityTabColDefs';
import { clearEvent, isEventMarked } from '../limits-list/eventBuffer';

export type PriorityChangeProps = {
  endpoint: string;
  updatePriorityEndpoint: string;
  queryKey: string;
  playerId?: string;
  canEdit: boolean;
  isPlayerMode?: boolean;
  eventMarker?: string;
  markEvent?: () => void;
};

export default function PriorityChange({
  endpoint,
  updatePriorityEndpoint,
  queryKey,
  playerId,
  canEdit,
  isPlayerMode = true,
  eventMarker,
  markEvent,
}: PriorityChangeProps) {
  const player = useAppSelector((state) => state.sharedData.player);

  const queryKeyArray = useMemo(() => {
    if (isPlayerMode) {
      return [queryKey, player?._id];
    }
    return [queryKey];
  }, [queryKey, player?._id, isPlayerMode]);

  const {
    data: response,
    isLoading: loading,
    refetch,
  } = useBaseQuery<{ success: boolean; data: any[] }>({
    endpoint,
    queryKey: queryKeyArray,
    enabled: isPlayerMode ? !!playerId : true,
  });

  useEffect(() => {
    if (eventMarker && isEventMarked(eventMarker)) {
      refetch();
      clearEvent(eventMarker);
    }
  }, [refetch, eventMarker]);

  const handleRowDragEnd = async (event: any) => {
    if (!event?.api) return;

    const reorderedLimits: { _id: string; priority: number }[] = [];
    let index = 1;

    event.api.forEachNode((node: any) => {
      if (node.data && !node.data.isPlaceholder) {
        reorderedLimits.push({ _id: node.data._id, priority: index++ });
      }
    });

    try {
      await axiosInstance.put(updatePriorityEndpoint, {
        reorderedLimits,
        ...(isPlayerMode && { playerId }),
      });
      markEvent && markEvent();
      refetch();
    } catch (error) {
      console.error('Failed to update priorities:', error);
    }
  };

  return (
    <PDataGrid
      rowModelType="clientSide"
      rowDragManaged
      suppressMoveWhenRowDragging={false}
      animateRows
      showFooter={false}
      getRowId={(params: any) => params.data._id?.toString()}
      onRowDragEnd={handleRowDragEnd}
      colDefs={getPriorityTabColDefs({
        canGeneralLimitEdit: canEdit,
      })}
      rowData={response?.data || []}
      loading={loading}
    />
  );
}
