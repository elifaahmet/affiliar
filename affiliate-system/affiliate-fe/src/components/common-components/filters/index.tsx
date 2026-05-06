import { useMemo } from 'react';
import Icon from '@components/core-components/icon';

type AnyObj = Record<string, any>;

export interface FiltersProps {
  closeFilters: boolean;
  toggleFilters?: () => void;
  hideFiltersSection?: boolean;

  renderInputs?: () => JSX.Element;
  handleApplyFilters?: () => void;
  handleReset?: () => void;
  hasFiltersApplied?: boolean;

  showTags: boolean;
  filters: AnyObj;
  removeFilter: (filterKey: string) => void;

  handleExportCSV?: (mode?: 'selected' | 'full') => void;
  canDownloadCsv?: boolean;
  isLoadingCsv?: boolean;
  notDisableCsv?: boolean;

  showAddPlayer?: boolean;
  refetch?: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  return dateRegex.test(value) && !isNaN(Date.parse(value));
};

const FRIENDLY_FIELD_NAMES: Record<string, string> = {
  id: 'ID',
  email: 'Email',
  username: 'Username',
  country: 'Country',
  city: 'City',
  isValidated: 'Validate Level',
  isBlocked: 'Blocked Status',
  registerStartDate: 'Registration Start',
  registerEndDate: 'Registration End',
  startDate: 'Last Login Start',
  endDate: 'Last Login End',
  dateOfBirth: 'Birthday',
  sortByBalance: 'Sort By Balance',
  sourceType: 'Acquisition Source',
  mobileNumber: 'Mobile Number',
  selectedZipCode: 'Zip Code',
};

const SORT_BY_BALANCE_LABELS: Record<string, string> = {
  balance_desc: 'By Balance (High to Low)',
  balance_asc: 'By Balance (Low to High)',
};

const HIDDEN_TAG_KEYS = new Set(['mobileCountryCode', 'tz']);

const getFriendlyFieldName = (key: string) => FRIENDLY_FIELD_NAMES[key] ?? key;

const renderFilterValue = (key: string, value: any) => {
  if (HIDDEN_TAG_KEYS.has(key)) return null;

  const friendlyKey = getFriendlyFieldName(key);

  if (key === 'sortByBalance') {
    const label = SORT_BY_BALANCE_LABELS[value] ?? value;
    return `${friendlyKey}: ${label}`;
  }

  if (isValidDate(value)) return `${friendlyKey}: ${formatDate(value)}`;

  if (typeof value === 'object' && value !== null) {
    return `${friendlyKey}: ${value.name || value.id || value.label || String(value)}`;
  }

  return `${friendlyKey}: ${String(value)}`;
};

export default function Filters({
  closeFilters,
  toggleFilters,
  hideFiltersSection = false,
  renderInputs,
  handleApplyFilters,
  handleReset,
  hasFiltersApplied = false,
  showTags,
  filters,
  removeFilter,
  handleExportCSV,
  canDownloadCsv = false,
  isLoadingCsv = false,
  notDisableCsv = false,
}: Readonly<FiltersProps>) {
  const activeTags = useMemo(() => {
    if (!filters) return [];
    return Object.entries(filters)
      .map(([key, value]) => ({ key, display: renderFilterValue(key, value) }))
      .filter((x) => Boolean(x.display));
  }, [filters]);

  return (
    <>
      <div className='flex flex-row w-full relative mt-0 mb-4 justify-between items-start gap-3'>
        <div className='flex flex-col gap-3 min-w-0 pt-3'>
          {!hideFiltersSection && (
            <button
              onClick={toggleFilters}
              className='flex items-center justify-between pl-3 h-10 w-44 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors font-bold text-sm shrink-0'
              type='button'
            >
              <span className='flex items-center gap-2 justify-center w-full'>
                <Icon iconName='filterWhite' svgProps={{ width: '21px', height: '21px' }} />
                <span className='pr-3 w-full'>{closeFilters ? 'Close Filters' : 'Open Filters'}</span>
                <div className='flex min-w-7 w-7 h-10 rounded-r-md items-center justify-center bg-primary-dark'>
                  <Icon
                    iconName='whiteArrow'
                    className={`transition-transform duration-300 ${closeFilters ? 'rotate-0' : 'rotate-180'}`}
                    svgProps={{ width: '10px', height: '6px' }}
                  />
                </div>
              </span>
            </button>
          )}

          {showTags && activeTags.length > 0 && (
            <div className='flex items-center gap-2 min-w-0 overflow-hidden w-full'>
              <div className='flex items-center gap-2 min-w-0 overflow-x-auto whitespace-nowrap flex-1'>
                {activeTags.map(({ key, display }) => (
                  <div
                    key={key}
                    className='bg-primary text-white px-2 py-1 rounded-md inline-flex text-[13px] items-center gap-2 shrink-0'
                    title={display as string}
                  >
                    <span className='max-w-[260px] truncate'>{display}</span>
                    <button
                      className='text-gray-200 hover:text-white flex items-center'
                      onClick={() => removeFilter(key)}
                      type='button'
                    >
                      <Icon svgProps={{ width: 13, height: 13 }} iconName='whiteCancel' />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className='flex flex-col items-end gap-3 pt-3 shrink-0'>
          {handleExportCSV && (
            <button
              onClick={() => handleExportCSV('selected')}
              disabled={!canDownloadCsv || isLoadingCsv}
              className={`flex h-10 items-center justify-center w-auto text-success p-3 rounded-md border border-success transition-colors hover:bg-success-light space-x-2 font-semibold text-[13px] ${
                !canDownloadCsv ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              type='button'
            >
              <Icon iconName='downloadGreen' svgProps={{ width: 20, height: 20 }} />
              <span>
                {isLoadingCsv ? 'Downloading...' : 'Download CSV'} {!notDisableCsv && '🚫'}
              </span>
            </button>
          )}

          {showTags && activeTags.length > 0 && (
            <button className='text-primary underline text-sm' onClick={handleReset} type='button'>
              Clear All
            </button>
          )}
        </div>
      </div>

      {!hideFiltersSection && closeFilters && renderInputs && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleApplyFilters?.();
          }}
          className='flex flex-col w-full p-4 gap-4 bg-[#F6F9FF] rounded-lg mb-6 mt-2'
        >
          <div className='grid grid-cols-6 gap-3 mt-1'>{renderInputs()}</div>

          <div className='flex justify-end gap-4'>
            <button
              type='button'
              onClick={handleReset}
              className='flex justify-center h-10 w-60 items-center bg-primary-light text-primary px-4 rounded-lg hover:bg-primary-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary space-x-2 font-bold text-sm'
            >
              Reset
            </button>
            <button
              type='submit'
              disabled={!hasFiltersApplied}
              className='flex justify-center disabled:opacity-50 disabled:cursor-not-allowed h-10 w-60 items-center bg-primary text-white px-4 rounded-lg hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary space-x-2 font-bold text-sm'
            >
              Apply
            </button>
          </div>
        </form>
      )}
    </>
  );
}
