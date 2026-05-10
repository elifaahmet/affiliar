import 'ag-grid-enterprise';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateValueType } from 'react-tailwindcss-datepicker';
import StatusChip from '@components/common-components/chip/StatusChip';
import Filters from '@components/common-components/filters';
import BDatePicker from '@components/core-components/datePicker';
import DateRangePicker from '@components/core-components/datePicker/DateRangePicker';
import { PDataGrid } from '@components/core-components/grid/PDataGrid';
import Icon from '@components/core-components/icon';
import PInput from '@components/core-components/input';
import CustomPhoneInput from '@components/core-components/phoneInput';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { GridReadyEvent } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
import { baseService } from 'api/core/baseService';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { COUNTRY_API_URLS, PLAYERS_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import { CMS_BASE_URL } from 'config/cmsAxiosInstance';
import { useAppSelector } from 'hooks/redux';
import { getDateColDef } from 'utils/ag-grid/getDateColDef';
import { formatDate } from 'utils/common/formatDate';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';
import { storageHelper } from 'utils/storage/StorageHelper';
import { formatTzOffset, getGlobalTimezone } from 'utils/timezone';

import DetailCellRenderer from './components/DetailCellRenderer';
import { downloadPlayersCSV, getPlayerMobileNumber } from './helper';
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000)?.toFixed(1)?.replace('.0', '')}m`;
  }
  if (num >= 1000) {
    return `${(num / 1000)?.toFixed(1)?.replace('.0', '')}k`;
  }
  return num?.toString();
};

type PlayerWalletTotalBalance = {
  currencyId?: string;
  currencyCode?: string;
  currencyName?: string;
  currencySymbol?: string;
  fixedValueCount?: number;
  totalBalance: number;
  walletCount?: number;
  playerCount?: number;
};

const SORT_BY_BALANCE_OPTIONS = [
  { value: 'balance_desc', label: 'By Balance (High to Low)' },
  { value: 'balance_asc', label: 'By Balance (Low to High)' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'admin_affiliate', label: 'Admin Affiliate' },
  { value: 'player_referral', label: 'Player Referral' },
  { value: 'direct', label: 'Direct' },
];

type Region = {
  id: number;
  name: string;
};

function List() {
  const gridApiRef = useRef<any>(null);
  const [page] = useState(1);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [limit] = useState(50);
  const [filterParams, setFilterParams] = useState<any>({});
  const userId = storageHelper.getStoreWithDecryption('userId');
  const [showTags, setShowTags] = useState(false);
  const { data: countryies } = useBaseQuery<Region[]>({
    endpoint: COUNTRY_API_URLS.GET_COUNTRIES(userId),
  });
  const [mobileCountryCode, setMobileCountryCode] = useState<string>('');
  const mapOptions = (data: any, labelTitle: string) => {
    return data?.map((item: any) => ({
      value: item.name.toString(),
      label: item[labelTitle],
    }));
  };
  const countryOptions = mapOptions(countryies, 'name');
  const [showFilters, setShowFilters] = React.useState(true);
  const [playerId, setPlayerId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [registrationDate, setRegistrationDate] = React.useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({
    startDate: null,
    endDate: null,
  });
  const [lastLoginDate, setLastLoginDate] = React.useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({
    startDate: null,
    endDate: null,
  });
  const [mobileNumber, setSelectedMobileNumber] = useState<string>('');
  const [selectedZipCode, setSelectedZipCode] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<DateValueType | null>(null);
  const [isValidated, setIsValidated] = useState<string>('');
  const [isBlocked, setIsBlocked] = useState<string>('');
  const [country, setCountry] = useState<any>('');
  const [city, setCity] = useState<string>('');

  const [playersTotalBalances, setPlayersTotalBalances] = useState<PlayerWalletTotalBalance[]>([]);

  const [sortByBalance, setSortByBalance] = useState<string>('');
  const [sourceType, setSourceType] = useState<string>('');
  const rawPermissions = useAppSelector((state) => state.auth.permissions || []);
  const [username, setUsername] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);
  const permissionGroups = extractPermissionGroups(rawPermissions);
  const filterParamsToString = (params: any) => {
    const filteredParams = Object.keys(params).reduce((acc: any, key: string) => {
      const value = params[key];
      if (typeof value === 'object' && value !== null && (value.id || value.value)) {
        const val = value.id || value.value;
        acc[key] = val;
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
    if (
      (filteredParams.startDate ||
        filteredParams.endDate ||
        filteredParams.registerStartDate ||
        filteredParams.registerEndDate) &&
      !filteredParams.tz
    ) {
      filteredParams.tz = formatTzOffset(getGlobalTimezone().offsetMinutes);
    }
    const query = Object.keys(filteredParams)
      .map((key) => `${key}=${encodeURIComponent(filteredParams[key])}`)
      .join('&');

    return query ? `&${query}` : '';
  };

  const handleExportCSV = async (exportMode?: 'selected' | 'full') => {
    const exportType = exportMode === 'full' ? 'full' : 'filtered';
    const api = gridRef.current?.api;
    const pageSize = api?.paginationGetPageSize?.() ?? 50;
    const currentPage = (api?.paginationGetCurrentPage?.() ?? 0) + 1;
    const queryParts: string[] = [`exportType=${exportType}`];
    if (exportType === 'filtered') {
      queryParts.push(`page=${currentPage}`, `limit=${pageSize}`);
    }
    const filterQuery = filterParamsToString(filterParams);
    if (filterQuery) {
      queryParts.push(filterQuery.slice(1));
    }
    const exportEndpoint = `${PLAYERS_API_URLS.GET_PLAYERS(userId)}?${queryParts.join('&')}`;

    setExportLoading(true);
    try {
      const data = await baseService.getAll<any>(exportEndpoint);
      if (data?.data?.length > 0) {
        downloadPlayersCSV(data);
      }
    } finally {
      setExportLoading(false);
    }
  };

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
  const balanceCellStyle = {
    ...customStyles,
    alignItems: 'flex-start',
    whiteSpace: 'normal',
    overflow: 'visible',
    textOverflow: 'initial',
    flexWrap: 'wrap',
  };

  const gridRef = useRef<AgGridReact>(null);

  const [colDefs] = useState<any>([
    {
      headerName: 'Player ID',
      field: 'id',
      pinned: 'left',
      minWidth: 100,
      width: 100,
      menuTabs: [],
      sortable: false,
      filter: null,
      floatingFilter: false,
      cellClass: 'ellipsis-cell',
      cellStyle: {
        ...customStyles,
      },
      cellRenderer: (params: any) => {
        if (params?.data?.isTotalsRow) {
          return <span className="font-semibold">System Total</span>;
        }

        return (
          <Link to={`/players/list/detail/${params.data?.id}`} className="text-primary underline">
            {params.data?.id}
          </Link>
        );
      },
    },
    {
      headerName: 'Username',
      flex: 1,
      minWidth: 140,
      field: 'username',
      pinned: 'left',
      filter: null,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      cellStyle: {
        ...customStyles,
      },
    },
    {
      headerName: 'Email',
      field: 'email',
      filter: null,
      flex: 1,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      minWidth: 200,
      cellStyle: {
        ...customStyles,
      },
    },
    {
      headerName: 'Mobile Number',
      field: 'mobileNumber',
      filter: null,
      flex: 1,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      minWidth: 170,
      cellStyle: {
        ...customStyles,
      },
      valueGetter: (params: any) => getPlayerMobileNumber(params.data),
    },
    {
      headerName: 'Verification Status',
      field: 'verifyLevel',
      filter: null,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      flex: 1,
      minWidth: 180,
      cellStyle: {
        ...customStyles,
      },
      filterParams: {
        cellRenderer: (params: any) => {
          const val = params.value;
          return `Level ${val}`;
        },
      },
      cellRenderer: (params: any) => {
        const isTotalsRow = params?.data?.isTotalsRow;

        if (isTotalsRow) {
          return '';
        }

        const level = params.value;

        const levelIcons: Record<string, string> = {
          0: 'level0',
          1: 'level1',
          2: 'level2',
          3: 'level3',
          4: 'level4',
        };

        return (
          <div className={`flex flex-row gap-2 justify-start w-full items-center`}>
            <Icon iconName={levelIcons[level] || 'level0'} svgProps={{ width: 41, height: 14 }} />
            <span>{`Level ${level}`}</span>
          </div>
        );
      },
    },
    {
      headerName: 'Blocked Status',
      field: 'isBlocked',
      filter: null,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      flex: 1,
      minWidth: 140,
      cellStyle: {
        ...customStyles,
      },
      cellRenderer: (params: any) => {
        const isTotalsRow = params?.data?.isTotalsRow;

        if (isTotalsRow) {
          return '';
        }

        const status = params?.data?.isBlocked ? 'Blocked' : 'Active';
        return <StatusChip status={status} />;
      },
    },
    {
      headerName: 'Gamification Level',
      field: 'gamificationLevel',
      filter: null,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      flex: 1,
      minWidth: 180,
      cellStyle: {
        ...customStyles,
      },
      filterParams: {
        cellRenderer: (params: any) => {
          const val = params.value;
          return `Level ${val}`;
        },
      },
      cellRenderer: (params: any) => {
        const level = params?.value?.level;

        // const levelIcons: Record<string, string> = {
        //   0: 'level0',
        //   1: 'level1',
        //   2: 'level2',
        //   3: 'level3',
        //   4: 'level4',
        // };

        const isTotalsRow = params?.data?.isTotalsRow;

        if (isTotalsRow) {
          return '';
        }

        return (
          <div className={`flex flex-row gap-2 justify-start w-full items-center`}>
            {params?.value?.image && (
              <img
                src={
                  params?.value?.image?.startsWith('/static/')
                    ? `${process.env.REACT_APP_PROTOCOL}://${process.env.REACT_APP_BASE_URL}${params?.value?.image}`
                    : `${CMS_BASE_URL}${params?.value?.image}`
                }
                alt={`${level}-icon`}
                className="w-6 h-6"
              />
            )}
            <span>{`${formatNumber(level)} - (${formatNumber(params.value?.label)})`}</span>
          </div>
        );
      },
    },
    {
      headerName: 'Balance',
      field: 'balance',
      filter: null,
      headerTooltip: 'Only one currency can be filtered at a time',
      tooltipHeader: 'Can filter only one currency at a time',
      flex: 1,
      minWidth: 180,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      autoHeight: true,
      wrapText: true,
      cellStyle: balanceCellStyle,
      valueGetter: (params: any) => {
        const ledger = Array.isArray(params.data.wallets) ? params.data.wallets : [];
        if (!ledger.length) return 0;
        const totalBalance = ledger.reduce((acc: number, item: any) => {
          const raw = item?.balance;
          const numeric = raw?.$numberDecimal ?? raw;
          const parsed = parseFloat(numeric) || 0;
          return acc + parsed;
        }, 0);
        return totalBalance || 0;
      },
      comparator: (valueA: any, valueB: any, _nodeA: any, _nodeB: any) => {
        return valueA - valueB;
      },
      filterParams: {
        defaultOption: 'greaterThanOrEqual',
        numberParser: (text: string) => {
          return parseFloat(text?.replace(',', '.'));
        },
      },
      cellRenderer: (params: any) => {
        const isTotalsRow = params?.data?.isTotalsRow;
        const ledger = Array.isArray(params?.data?.wallets) ? params.data.wallets : [];
        const totalBalances = Array.isArray(params?.data?.totalBalancesByCurrency)
          ? params.data.totalBalancesByCurrency
          : [];

        const formatNumber = (value: number | string, _fixedValue?: number) => {
          const numericValue = Number(value || 0);
          if (numericValue === 0) return 0;

          return numericValue.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        };

        // Pinned bottom total row
        if (isTotalsRow) {
          return (
            <div className="flex my-2 gap-1 flex-col items-center">
              <div className="flex flex-col gap-2">
                {totalBalances.length > 0 ? (
                  totalBalances.map((item: any, index: number) => (
                    <div className="flex gap-1" key={item.currencyId || item.currencyCode || index}>
                      <span className="font-semibold">
                        {formatNumber(item.totalBalance, item.fixedValueCount)}{' '}
                        {item.currencySymbol}
                      </span>
                    </div>
                  ))
                ) : (
                  <span>No data available</span>
                )}
              </div>
            </div>
          );
        }

        // Single wallet row
        if (ledger.length === 1) {
          const { balance, currency } = ledger[0];
          const parsedBalance = typeof balance === 'object' ? balance?.$numberDecimal : balance;

          return (
            <div className="flex my-4 gap-1 flex-col items-center">
              {parsedBalance !== undefined && parsedBalance !== null ? (
                <span className="inline-block">
                  {formatNumber(parsedBalance, currency?.fixedValueCount)} {currency?.symbol}
                </span>
              ) : (
                'No data available'
              )}
            </div>
          );
        }

        // Multiple wallet rows
        return (
          <div className="flex my-2 gap-1 flex-col items-center">
            <div className="flex flex-col gap-2">
              {ledger.length > 0 ? (
                ledger.map((item: any, index: number) => {
                  const { balance, currency } = item;
                  const parsedBalance =
                    typeof balance === 'object' ? balance?.$numberDecimal : balance;

                  return (
                    <div className="flex gap-1" key={index}>
                      <span>
                        {formatNumber(parsedBalance, currency?.fixedValueCount)} {currency?.symbol}
                      </span>
                    </div>
                  );
                })
              ) : (
                <span>No data available</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      headerName: 'Winning Tendency',
      field: 'winningTendency',
      filter: null,
      flex: 1,
      minWidth: 200,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
      cellClass: 'ellipsis-cell',
      cellStyle: {
        ...customStyles,
      },
      cellRenderer: (params: any) => {
        const isTotalsRow = params?.data?.isTotalsRow;

        if (isTotalsRow) {
          return '';
        }

        const trends = [
          {
            text: 'Very High Tendency',
            style: 'bg-[#FF4B551A] border-[#FF4B55]',
            icon: 'highTendency',
          },
          {
            text: 'High Tendency',
            style: 'bg-[#FF4B551A] border-[#FF4B55]',
            icon: 'highTendency',
          },
          {
            text: 'Medium Tendency',
            style: 'bg-[#1B84FF1A] border-[#1B84FF]',
            icon: 'mediumTendency',
          },
          {
            text: 'Low Tendency',
            style: 'bg-[#17C6531A] border-[#17C653]',
            icon: 'lowTendency',
          },
        ];

        const trend = trends.find((t) => t.text === params.value);

        if (!trend) return <span className="text-gray-400 italic">Unknown</span>;

        return (
          <div
            className={`px-2 flex flex-row gap-1 justify-start w-full text-gray-700 items-center h-[30px] text-sm border-l-2 rounded-lg ${trend.style}`}
          >
            <Icon iconName={trend.icon} svgProps={{ width: 12, height: 12 }} />
            <span>{trend.text}</span>
          </div>
        );
      },
    },
    getDateColDef('lastLogin', 'Last Login', {
      minWidth: 160,
      filter: null,
      floatingFilter: false,
      format: 'DD/MM/YYYY - HH:mm',
      menuTabs: [],
      sortable: false,
    }),
    getDateColDef('createdAt', 'Created', {
      minWidth: 160,
      format: 'DD/MM/YYYY - HH:mm',
      cellStyle: customStyles,
      filter: null,
      floatingFilter: false,
      menuTabs: [],
      sortable: false,
    }),
    // commented out for now as per UX decision
    // {
    //   headerName: 'Quick Action',
    //   IsRowMaster: false,
    //   detail: false,
    //   field: 'quickProcess',
    //   minWidth: 250,
    //   floatingFilter: false,
    //   menuTabs: [],
    //   sortable: false,
    //   flex: 1,
    //   cellStyle: {
    //     ...customStyles,
    //   },
    //   cellRenderer: (params: any) => {
    //     const handleAddQuick = () => {
    //       // TODO: Implement quick add functionality
    //     };
    //     const handleView = () => {
    //       if (params.node.expanded) {
    //         params.node.setExpanded(false);
    //       } else {
    //         params.node.setExpanded(true);
    //       }
    //     };

    //     return (
    //       <>
    //         <div className="flex flex-row w-full align-center gap-3 justify-center">
    //           <button
    //             onClick={handleAddQuick}
    //             className="flex flex-row w-full items-center h-[30px] gap-1 m-auto justify-center px-3 rounded-md transition border border-dashed border-primary bg-primary-light text-primary"
    //           >
    //             <Icon iconName="mathPlus" svgProps={{ width: 16, height: 16 }} />
    //             Add 🚫
    //           </button>
    //           <button
    //             onClick={handleView}
    //             className="flex flex-row w-full items-center h-[30px] gap-2 m-auto mr-3 justify-center px-3 rounded-md transition bg-primary-light text-primary"
    //           >
    //             View 🚫
    //             <Icon iconName="blueDropdown" svgProps={{ width: 10, height: 10 }} />
    //           </button>
    //         </div>
    //       </>
    //     );
    //   },
    // },
  ]);

  const createDataSource = useCallback(
    () => ({
      getRows: (paramsData: any) => {
        setPlayersLoading(true);

        const url = PLAYERS_API_URLS.GET_PLAYERS(userId);
        const endRow = paramsData.request.endRow;
        const page = endRow / limit;

        const endpoint = `${url}?page=${page}&limit=${limit}${filterParamsToString(filterParams)}`;

        axiosInstance
          .get(endpoint)
          .then((res) => {
            const data = res.data;
            const rows = data?.data || [];
            const total = data?.total || 0;

            paramsData.success({ rowData: rows, rowCount: total });
          })
          .catch(() => {
            paramsData.success({ rowData: [], rowCount: 0 });
          })
          .finally(() => {
            setPlayersLoading(false);
          });
      },
    }),
    [userId, limit, filterParams]
  );

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
    const gridElement = document.getElementsByClassName('ag-root')[0] as HTMLElement;
    if (gridElement) {
      gridElement.style.minHeight = '400px';
    }
    gridApiRef.current = params.api;

    params.api.setGridOption('serverSideDatasource', createDataSource());
  };

  const refetch = useCallback(() => {
    if (gridApiRef.current && gridApiRef.current.setGridOption) {
      const dataSource = createDataSource();
      gridApiRef.current.setGridOption('serverSideDatasource', dataSource);
    }
  }, [createDataSource]);

  const totalsRow = useMemo(() => {
    if (!playersTotalBalances?.length) return null;

    return {
      id: 'system-total-balance-row',
      isTotalsRow: true,
      totalBalancesByCurrency: playersTotalBalances,
    };
  }, [playersTotalBalances]);

  useEffect(() => {
    if (gridApiRef.current && gridApiRef.current.setGridOption) {
      const dataSource = createDataSource();
      gridApiRef.current.setGridOption('serverSideDatasource', dataSource);
    }
  }, [createDataSource, filterParams, page, limit]);

  useEffect(() => {
    if (!userId) return;

    const totalBalancesUrl = PLAYERS_API_URLS.GET_PLAYERS_TOTAL_BALANCE(userId);
    const query = filterParamsToString(filterParams).replace(/^&/, '');
    const endpoint = query ? `${totalBalancesUrl}?${query}` : totalBalancesUrl;

    axiosInstance
      .get(endpoint)
      .then((res) => {
        setPlayersTotalBalances(res?.data?.data || []);
      })
      .catch(() => {
        setPlayersTotalBalances([]);
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .finally(() => {});
  }, [userId, filterParams]);

  useEffect(() => {
    if (!playersLoading) {
      gridApiRef.current?.resetRowHeights?.();
    }
  }, [playersLoading]);

  const handleReset = () => {
    setPlayerId('');
    setEmail('');
    setRegistrationDate({ startDate: null, endDate: null });
    setLastLoginDate({ startDate: null, endDate: null });
    setSelectedMobileNumber('');
    setMobileCountryCode('');
    setSelectedZipCode('');
    setIsValidated('');
    setIsBlocked('');
    setUsername('');
    setCountry('');
    setCity('');
    setDateOfBirth(null);
    setSortByBalance('');
    setSourceType('');

    if (Object.keys(filterParams).length > 0) {
      setFilterParams({});
      setShowTags(false);
      setShowFilters(true);
    }
  };
  const removeFilter = (filterKey: string) => {
    const newFilters = { ...filterParams };
    delete newFilters[filterKey];
    setFilterParams(newFilters);
    if (filterKey === 'sortByBalance') {
      setSortByBalance('');
    }
    if (filterKey === 'isBlocked') {
      setIsBlocked('');
    }
    if (filterKey === 'country') {
      setCountry('');
    }
    if (filterKey === 'city') {
      setCity('');
    }
    if (filterKey === 'sourceType') {
      setSourceType('');
    }

    if (Object.keys(newFilters).length === 0) {
      setShowTags(false);
      setShowFilters(true);
      handleReset();
    }
  };

  const hasFiltersApplied = () => {
    return !!(
      playerId ||
      email ||
      registrationDate?.startDate ||
      registrationDate?.endDate ||
      lastLoginDate?.startDate ||
      lastLoginDate?.endDate ||
      mobileNumber ||
      selectedZipCode ||
      isValidated ||
      isBlocked ||
      username ||
      country ||
      city ||
      mobileCountryCode ||
      dateOfBirth ||
      sortByBalance ||
      sourceType
    );
  };

  const handleApplyFilters = () => {
    const filters = {
      ...(registrationDate &&
        registrationDate.startDate && {
          registerStartDate: formatDate(registrationDate.startDate),
          registerEndDate: formatDate(registrationDate.endDate),
        }),
      ...(lastLoginDate &&
        lastLoginDate.startDate && {
          startDate: formatDate(lastLoginDate.startDate),
          endDate: formatDate(lastLoginDate.endDate),
        }),
      ...(playerId && { id: playerId }),
      ...(username && { username }),
      ...(email && { email }),
      ...(mobileNumber && { mobileNumber }),
      ...(selectedZipCode && { selectedZipCode }),
      ...(isValidated && { isValidated }),
      ...(isBlocked && { isBlocked }),
      ...(country && { country }),
      ...(city && { city }),
      ...(mobileCountryCode && { mobileCountryCode }),
      ...(dateOfBirth && { dateOfBirth: formatDate(dateOfBirth.startDate) }),
      ...(sortByBalance && { sortByBalance }),
      ...(sourceType && { sourceType }),
    };

    setFilterParams(filters);
    gridApiRef.current?.refreshServerSideStore?.({ purge: true });
    if (Object.keys(filters).length > 0) {
      setShowTags(true);
    }
  };

  const renderInputs = () => {
    return (
      <>
        <PInput
          placeholder="Player ID"
          value={playerId}
          onChange={(e) => {
            setPlayerId(e.target.value);
          }}
        />
        <PInput
          placeholder="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <PInput
          placeholder="Username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
        <BSelectWithSearch
          label="Country"
          value={country || ''}
          onChange={(val: string) => {
            setCountry(val ? JSON.parse(val) : '');
          }}
          options={countryOptions || []}
          valueIsObject={true}
        />
        <PInput
          placeholder="City"
          value={city || ''}
          onChange={(e) => {
            setCity(e.target.value);
          }}
        />
        <BSelectWithSearch
          options={[
            {
              value: '0',
              label: 'Level 0',
            },
            {
              value: '1',
              label: 'Level 1',
            },
            {
              value: '2',
              label: 'Level 2',
            },
            {
              value: '3',
              label: 'Level 3',
            },
            {
              value: '4',
              label: 'Level 4',
            },
          ]}
          value={isValidated || ''}
          onChange={(val: string) => {
            setIsValidated(val ? JSON.parse(val) : '');
          }}
          label="Validate Level"
          valueIsObject={true}
          showSearch={false}
        />
        <BSelectWithSearch
          label="Blocked Status"
          options={[
            { value: 'true', label: 'Blocked' },
            { value: 'false', label: 'Active' },
          ]}
          value={isBlocked}
          onChange={(val: string) => {
            setIsBlocked(val || '');
          }}
          showSearch={false}
        />
        <BSelectWithSearch
          label="Sort By Balance"
          options={SORT_BY_BALANCE_OPTIONS}
          value={sortByBalance}
          onChange={(val: string) => {
            setSortByBalance(val || '');
          }}
          showSearch={false}
        />
        <BSelectWithSearch
          label="Acquisition Source"
          options={SOURCE_TYPE_OPTIONS}
          value={sourceType}
          onChange={(val: string) => {
            setSourceType(val || '');
          }}
          showSearch={false}
        />
        <BDatePicker
          value={dateOfBirth}
          placeholder="Birthday"
          onChange={(newDate: DateValueType | null) => setDateOfBirth(newDate)}
          className="w-full justify-center"
          showRange={false}
          showShortcuts={false}
        />
        <DateRangePicker
          value={[registrationDate.startDate, registrationDate.endDate]}
          setValue={(date) => setRegistrationDate({ startDate: date[0], endDate: date[1] })}
          label="Registration Date"
        />
        <DateRangePicker
          value={[lastLoginDate.startDate, lastLoginDate.endDate]}
          setValue={(date) => setLastLoginDate({ startDate: date[0], endDate: date[1] })}
          label="Last Login Date"
        />
        <CustomPhoneInput
          phone={mobileNumber}
          setPhone={(value: string, countryCode: string) => {
            setSelectedMobileNumber(value);
            setMobileCountryCode(countryCode);
          }}
        />
      </>
    );
  };

  return (
    <div className="flex flex-col w-full">
      <Filters
        closeFilters={showFilters}
        toggleFilters={() => setShowFilters(!showFilters)}
        renderInputs={renderInputs}
        handleApplyFilters={handleApplyFilters}
        handleReset={handleReset}
        hasFiltersApplied={hasFiltersApplied()}
        showTags={showTags}
        filters={filterParams}
        removeFilter={removeFilter}
        handleExportCSV={handleExportCSV}
        canDownloadCsv={checkPermission(permissionGroups, 'players.list.downloadCsv.view')}
        isLoadingCsv={exportLoading}
        notDisableCsv
        showAddPlayer
        refetch={refetch}
      />
      <PDataGrid
        loading={playersLoading}
        gridRef={gridRef}
        DetailCellRenderer={DetailCellRenderer}
        rowModelType="serverSide"
        cacheBlockSize={56}
        showFooter={true}
        colDefs={colDefs}
        gridOptions={{
          filter: false,
          floatingFilter: false,
          rowModelType: 'serverSide',
          serverSideStoreType: 'partial',
          cacheBlockSize: 50,
        }}
        onGridReady={onGridReady}
        disableFilter={true}
        pinnedBottomRowData={totalsRow ? [totalsRow] : []}
      />
    </div>
  );
}

export default List;
