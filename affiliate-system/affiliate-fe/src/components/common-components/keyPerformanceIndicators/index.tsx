import React, { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from 'react-beautiful-dnd';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';
import Modal from '@components/core-components/modal';
import { tabsData } from 'pages/dashboard/data';

import Widget from '../widget/Widget';

interface WidgetData {
  id: number;
  title: string;
  value: any;
  change: string;
  changeType: string;
  icon: string;
  linked?: boolean;
  backgroundColor: string;
  show: boolean;
}

interface Shortcut {
  id: number;
  title: string;
  icon: string;
  backgroundColor: string;
  show: boolean;
}

interface KeyPerformanceIndicatorsProps {
  defaultWidgetData?: WidgetData[];
  widgetData: WidgetData[];
  onChange?: (data: WidgetData[]) => void;
  activeTab?: string;
  dateRange?: { startDate: Date | null; endDate: Date | null };
}

const MAX_SHORTCUTS = 20;

const KeyPerformanceIndicators: React.FC<KeyPerformanceIndicatorsProps> = ({
  defaultWidgetData,
  widgetData,
  onChange,
  activeTab,
  dateRange,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [addedShorts, setAddedShorts] = useState<Shortcut[]>(
    widgetData.map(({ backgroundColor = 'bg-gray', icon, title, id, show }) => ({
      backgroundColor,
      icon,
      title,
      id,
      show,
    }))
  );
  const [tempAddedShorts, setTempAddedShorts] = useState<Shortcut[]>([]);
  const [allShorts, setAllShorts] = useState<(WidgetData & { isAdded?: boolean })[]>(
    defaultWidgetData || widgetData
  );

  useEffect(() => {
    const newShorts = defaultWidgetData || widgetData || [];
    setAllShorts((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(newShorts)) {
        return newShorts;
      }
      return prev;
    });
  }, [defaultWidgetData, widgetData]);

  useEffect(() => {
    const newAdded = widgetData.map(({ backgroundColor = 'bg-gray', icon, title, id, show }) => ({
      backgroundColor,
      icon,
      title,
      id,
      show,
    }));
    setAddedShorts((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(newAdded)) {
        return newAdded;
      }
      return prev;
    });
  }, [widgetData]);

  useEffect(() => {
    const openModal = () => setIsModalOpen(true);
    setTempAddedShorts(addedShorts);
    window.addEventListener('open-widget-edit-modal', openModal);
    return () => window.removeEventListener('open-widget-edit-modal', openModal);
  }, [addedShorts]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
  };

  const handleAddShort = (short: Shortcut) => {
    if (tempAddedShorts.length >= MAX_SHORTCUTS || tempAddedShorts.some((s) => s.id === short.id))
      return;
    setTempAddedShorts([...tempAddedShorts, short]);
    updateAllShorts(short.id, true);
  };

  const handleRemoveShort = (short: Shortcut) => {
    setTempAddedShorts(tempAddedShorts.filter((s) => s.id !== short.id));
    updateAllShorts(short.id, false);
  };

  const updateAllShorts = (id: number, isAdded: boolean) => {
    setAllShorts((prev) => prev.map((s) => (s.id === id ? { ...s, isAdded } : s)));
  };

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(tempAddedShorts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setTempAddedShorts(items);
  };
  const handleSaveShortcuts = () => {
    setAddedShorts(tempAddedShorts);
    const reorderedWidgets = tempAddedShorts
      .filter((short) => short.title !== 'Empty Data Summary')
      .map((short) => allShorts.find((widget) => widget.title === short.title))
      .filter((widget): widget is WidgetData => widget !== undefined);
    if (onChange) onChange(reorderedWidgets);
    setIsModalOpen(false);
  };

  const filteredShorts = allShorts
    .filter((item) => item.show)
    .map((short) => ({
      ...short,
      isAdded: !!tempAddedShorts.find((s) => s.title === short.title),
    }))
    .filter(
      (short) =>
        short.icon.toLowerCase().includes(searchText.toLowerCase()) ||
        short.title.toLowerCase().includes(searchText.toLowerCase()) ||
        short.isAdded
    );

  const ZERO_VALUES = [0, '0', '€0', '0.00'];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-x-5 gap-y-3">
        {widgetData
          .filter((item) => {
            if (item.title === 'Player Balance') {
              return (
                (item.show || ZERO_VALUES.includes(item.value)) &&
                [tabsData[0].label, tabsData[1].label].includes(activeTab || '')
              );
            }
            return item.show || ZERO_VALUES.includes(item.value);
          })
          .map((widget, index) => (
            <div key={index} className="col-span-1">
              <Widget {...widget} dateRange={dateRange} />
            </div>
          ))}
        <div className="col-span-1">
          <Widget
            title="Edit Data"
            value=""
            change=""
            changeType="none"
            icon="withdrawal"
            backgroundColor=""
          />
        </div>
        {/* {gridButtons} */}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Data Summary"
        content={
          <div className="flex flex-col gap-6 px-8 py-6 w-[947px]">
            <p className="text-sm font-normal text-gray-600">Customise and sort data summaries.</p>
            <div className="flex flex-row gap-4">
              <div className="flex flex-col gap-2 max-w-[414px] w-full max-h-[400px] overflow-y-auto main-no-scrollbar">
                <DragDropContext onDragEnd={handleOnDragEnd}>
                  <Droppable droppableId="addedShorts" direction="vertical">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="flex flex-col w-full gap-3"
                      >
                        {Array.from({ length: MAX_SHORTCUTS }).map((_, index) => {
                          const short = tempAddedShorts.filter((item) => item.show)[index];
                          if (
                            !short ||
                            !short.title ||
                            short.title === 'Empty Data Summary' ||
                            short.title === 'Edit Data'
                          ) {
                            return (
                              <div
                                key={`empty-${index}`}
                                className="flex flex-row items-center w-full gap-3 text-body-reg-13"
                              >
                                <button className="flex items-center justify-center min-w-10 w-10 h-10 rounded-md border border-gray-300 text-base bg-white text-gray-700 font-semibold">
                                  {index + 1}
                                </button>
                                <div className="flex flex-row gap-3 items-center justify-center bg-white border border-dashed border-gray-600 text-gray-600 text-body-reg-13 font-semibold px-3 h-10 w-full rounded-md">
                                  <span>Empty Data Summary</span>
                                </div>
                                <div className="min-w-10 w-10 h-10" />
                                <div className="min-w-10 w-10 h-10" />
                              </div>
                            );
                          }
                          return (
                            <Draggable
                              key={`${short.id}-${index}`}
                              draggableId={`${short.id}-${index}`}
                              index={index}
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="flex flex-row items-center w-full gap-3 text-body-reg-13"
                                >
                                  <button className="flex items-center justify-center min-w-10 w-10 h-10 rounded-md border border-gray-300 text-base bg-white text-gray-700 font-semibold">
                                    {index + 1}
                                  </button>
                                  <div
                                    className={`flex flex-row gap-3 items-center justify-start bg-white border border-dashed border-gray-600 text-gray-900 text-body-reg-13 font-semibold px-3 h-10 w-full rounded-md`}
                                  >
                                    <div
                                      className={`flex w-6 h-6 items-center justify-center rounded-[4px] ${short.backgroundColor}`}
                                    >
                                      <Icon
                                        iconName={short.icon}
                                        svgProps={{ width: 13, height: 13 }}
                                      />
                                    </div>
                                    <span>{short.title}</span>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleRemoveShort(short);
                                    }}
                                    className="flex items-center justify-center min-w-10 w-10 h-10 rounded-md border border-gray-300 text-base bg-white text-gray-700 font-semibold"
                                  >
                                    <Icon iconName="trashCan" className="text-gray-700 w-5 h-5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="flex items-center justify-center min-w-10 w-10 h-10 rounded-md border border-gray-300 text-base bg-gray-200 text-gray-700 font-semibold"
                                  >
                                    <Icon iconName="move" className="text-gray-700 w-5 h-5" />
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
              <hr className="w-px h-auto opacity-50 bg-[#CECCE4]" />
              <div className="flex flex-col gap-2 max-w-[414px] w-full max-h-[400px] overflow-y-auto">
                <div className="flex flex-col gap-3 max-w-[414px] w-full">
                  <span className="text-base font-extrabold text-gray-900 leading-none max-w-[414px] w-full">
                    Data Shortcuts ({tempAddedShorts.filter((item) => item.show)?.length} )
                  </span>
                  <PInput
                    placeholder="Search..."
                    iconName="search"
                    showIcon={true}
                    value={searchText}
                    id="filter-text-box"
                    onChange={handleSearch}
                    className="h-10 w-full md:w-80 sm:w-70 lg:w-96 bg-transparent pl-9"
                    wrapperClassNames="relative"
                  />
                  <hr className="w-[416px] border-t border-dashed border-[#CECCE4] opacity-50" />
                  <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto main-no-scrollbar">
                    {filteredShorts
                      .filter((short) => {
                        if (short.title === 'Player Balance') {
                          return [tabsData[0].label, tabsData[1].label].includes(activeTab || '');
                        }
                        return true;
                      })
                      .map((short) => (
                        <div key={short.id} className="flex flex-col items-center w-full gap-3">
                          <div className="flex flex-row items-center justify-between w-full gap-3">
                            <div className="flex flex-row items-center h-full gap-2">
                              <Icon
                                svgProps={{ width: 10, height: 10 }}
                                iconName={short.isAdded ? 'ellipse10' : 'ellipse3'}
                                className="w-3 h-3"
                              />
                              <span
                                className={`text-xs leading-none flex items-center ${
                                  short.isAdded
                                    ? 'text-gray-900 font-semibold'
                                    : 'text-gray-600 font-medium'
                                }`}
                              >
                                <span>{short.title}</span>
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                short.isAdded ? handleRemoveShort(short) : handleAddShort(short);
                              }}
                              className={`w-20 h-7 ${
                                short.isAdded
                                  ? 'bg-danger-light text-danger hover:opacity-80'
                                  : 'bg-primary text-white hover:bg-primary-dark'
                              } flex flex-row justify-center items-center rounded-md font-medium text-body-reg-12`}
                            >
                              {short.isAdded ? 'Remove' : 'Add'}
                            </button>
                          </div>
                          <hr className="w-[416px] border-t border-dashed border-[#CECCE4] opacity-50" />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
        footer={
          <div className="flex flex-row gap-3 items-center justify-between bg-white h-[70px]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 h-10 w-[139px] text-body-reg-13 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSaveShortcuts}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark h-10 w-[139px] text-body-reg-13 font-semibold"
            >
              Save
            </button>
          </div>
        }
      />
    </>
  );
};

export default KeyPerformanceIndicators;
