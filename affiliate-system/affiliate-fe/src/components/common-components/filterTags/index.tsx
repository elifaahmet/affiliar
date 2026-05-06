import Icon from '@components/core-components/icon';

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const isValidDate = (value: Date) => {
  if (typeof value !== 'string') return false;

  const dateRegex = /^\d{4}-\d{2}-\d{2}/;

  return dateRegex.test(value) && !isNaN(Date.parse(value));
};

const getFriendlyFieldName = (key: string) => {
  switch (key) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'withdrawal':
      return 'Withdrawal';
    case 'deposit':
      return 'Deposit';
    case 'state':
      return 'State';
    case 'bonus':
      return 'Bonus';
    case 'Error':
      return 'Error';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'success':
      return 'Success';
    case 'isRegistered':
      return 'Registered';
    case 'playerId':
    case 'id':
      return 'ID';
    case 'lastLogin':
      return 'Last Login Date';
    case 'dateOfBirth':
      return 'Date of Birth';
    case 'isValidated':
      return 'Validated';
    case 'registrationDate':
      return 'Registration Date';
    case 'country':
      return 'Country';
    case 'gender':
      return 'Gender';
    case 'email':
      return 'Email';
    case 'mobile':
      return 'Mobile';
    case 'zip':
      return 'Zip Code';
    case 'language':
      return 'Language';
    case 'marketingCode':
      return 'Marketing Code';
    case 'revenueScheme':
      return 'Revenue Scheme';
    case 'mobileNumber':
      return 'Mobile Number';
    case 'date':
      return 'Date';
    case 'dateComp':
      return 'Date Comparison';
    case 'game':
      return 'Game';
    case 'providers':
      return 'Providers';
    case 'provider':
      return 'Provider';
    case 'categories':
      return 'Categories';
    case 'isBonus':
      return 'Is Bonus';
    case 'currency':
      return 'Currency';
    case 'type':
      return 'Type';
    case 'selectedGame':
      return 'Selected Game';
    case 'selectedGameId':
      return 'Selected Game ID';
    case 'selectedProviderId':
      return 'Selected Provider ID';
    case 'selectedPlatformId':
      return 'Selected Platform ID';
    case 'selectedTransactionId':
      return 'Selected Transaction ID';
    case 'relatedBetId':
      return 'Related Bet ID';
    case 'table':
      return 'Table';
    case 'roundId':
      return 'Round ID';
    case 'dealerId':
      return 'Dealer ID';
    case 'gameId':
      return 'Game ID';
    case 'platform':
      return 'Platform';
    case 'transactionId':
      return 'Transaction ID';
    case 'startDate':
      return 'Start Date';
    case 'endDate':
      return 'End Date';
    case 'category':
      return 'Category';
    case 'totalCount':
      return 'Total Count';
    case 'playerCount':
      return 'Player Count';
    case 'roundCount':
      return 'Round Count';
    case 'profitability':
      return 'Profitability';
    case 'username':
      return 'Username';
    case 'gameCount':
      return 'Game Count';
    case 'transactionType':
      return 'Transaction Type';
    case 'providerTransactionId':
      return 'Provider Transaction ID';
    case 'betId':
      return 'Bet ID';
    case 'eventType':
      return 'Event Type';
    case 'odds':
      return 'Odds';
    case 'betType':
      return 'Bet Type';
    case 'betCount':
      return 'Bet Count';
    case 'ipAddress':
      return 'Ip Address';
    case 'source':
      return 'Source';
    case 'walletType':
      return 'Wallet Type';
    case 'bonusBet':
      return 'Bonus Bet';
    case 'isTest':
      return 'Is Test';
    case 'affiliateId':
      return 'Affiliate ID';
    case 'sportName':
      return 'Sport Name';
    case 'betsCount':
      return 'Bets Count';
    case 'openBetsCount':
      return 'Open Bets Count';
    case 'marketType':
      return 'Market Type';
    case 'bets':
      return 'Bets';
    case 'live':
      return 'Live';
    case 'userId':
      return 'User ID';
    case 'status':
      return 'Status';
    case 'sportId':
      return 'Sport ID';
    case 'role':
      return 'Role';
    case 'lastLoginStart':
      return 'Last Login (Start)';
    case 'lastLoginEnd':
      return 'Last Login (End)';
    case 'gameCode':
      return 'Game Code';
    case 'userCountMin':
      return 'User Count (Min)';
    case 'userCountMax':
      return 'User Count (Max)';
    case 'permissionCountMin':
      return 'Permission Count (Min)';
    case 'permissionCountMax':
      return 'Permission Count (Max)';
    case 'roleName':
      return 'Role Name';
    case 'gameName':
      return 'Game Name';
    case 'method':
      return 'Method';
    case 'birthDate':
      return 'Birth Date';
    case 'isRead':
      return 'Status';
    case 'createdBy':
      return 'Created By';
    case 'registerStartDate':
      return 'Register Start Date';
    case 'registerEndDate':
      return 'Register End Date';
    case 'providerStatus':
      return 'Provider Status';
    case 'providerStatusByProvider':
      return 'Provider Status by Provider';
    case 'displayOnSidebar':
      return 'Display on Sidebar';
    case 'displayStatus':
      return 'Display Status';
    default:
      return key;
  }
};

const renderFilterValue = (key: string, value: any) => {
  if (
    key === 'registrationDateComp' ||
    key === 'lastLoginComp' ||
    key === 'lastLoginDateComp' ||
    key === 'dateOfBirthComp' ||
    key === 'mobileCountryCode'
  )
    return null;

  const friendlyKey = getFriendlyFieldName(key);

  if (isValidDate(value)) {
    return `${friendlyKey}: ${formatDate(value)}`;
  }

  if (typeof value === 'object' && value !== null) {
    return `${friendlyKey}: ${value.name || value.id || value.label || value}`;
  }

  return `${friendlyKey}: ${value}`;
};

function FilterTags({
  showTags,
  filters,
  reset,
  removeFilter,
  handleExportCSV,
  canDownloadCsv = false,
  isLoadingCsv = false,
  notDisableCsv = false,
}: {
  showTags: boolean;
  filters: { [key: string]: any };
  reset: () => void;
  removeFilter: (filterKey: string) => void;
  handleExportCSV?: () => void;
  canDownloadCsv?: boolean;
  isLoadingCsv?: boolean;
  notDisableCsv?: boolean;
}) {
  const handleDownloadCsvClick = () => {
    try {
      window?.sessionStorage?.setItem('csvExportFiltered', '1');
    } catch {
      // ignore storage failures
    }
    handleExportCSV?.();
  };

  return (
    <div
      className={`transition-all w-full  duration-500 ease-in-out transform ${
        showTags ? 'max-h-45 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-2'
      }`}
      style={{
        transitionProperty: 'max-height, opacity, transform',
        height: showTags ? 'auto' : '0',
      }}
    >
      <div
        style={{
          height: showTags ? '' : '0',
        }}
        className="flex justify-between gap-2 items-center"
      >
        <div className="flex justify-start gap-2 items-center">
          <p className="font-semibold">Filters Applied:</p>
          <button className="text-primary underline" onClick={reset}>
            Clear All
          </button>
        </div>
        {handleExportCSV && (
          <button
            onClick={handleDownloadCsvClick}
            disabled={!canDownloadCsv || isLoadingCsv}
            className={`flex h-10 items-center justify-center w-auto text-success p-3 rounded-md border border-success transition-colors hover:bg-success-light space-x-2 font-semibold text-[13px] ${
              !canDownloadCsv ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Icon iconName="downloadGreen" svgProps={{ width: 20, height: 20 }} />
            <span>
              {isLoadingCsv ? 'Downloading...' : 'Download CSV'} {!notDisableCsv && '🚫'}
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 my-6">
        {filters &&
          Object.entries(filters)?.map(([key, value]) => {
            const filterDisplay = renderFilterValue(key, value);
            return (
              filterDisplay && (
                <div
                  key={key}
                  className="bg-primary text-white  p-2 rounded-md flex text-[13px] items-center space-x-2"
                >
                  <span>{filterDisplay}</span>
                  <button
                    className="text-gray-500 hover:text-gray-700 flex justify-center items-center"
                    onClick={() => removeFilter(key)}
                  >
                    <Icon
                      svgProps={{ width: 13, height: 13 }}
                      iconName="whiteCancel"
                      className="flex justify-center items-center"
                    />
                  </button>
                </div>
              )
            );
          })}
      </div>
    </div>
  );
}

export default FilterTags;
