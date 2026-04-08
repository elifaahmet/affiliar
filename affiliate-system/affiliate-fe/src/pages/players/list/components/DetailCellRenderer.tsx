import MasterDetailCard from './MasterDetailCard';

function DetailCellRenderer({ params }: any) {
  const sections = [
    {
      title: 'Profile Info',
      topBorderColor: 'bg-primary',
      items: [
        { label: 'Player Info', iconName: 'star' },
        { label: 'Privacy Info', iconName: 'star' },
        { label: 'Messages', iconName: 'star' },
        { label: 'Emails', iconName: 'star' },
      ],
    },
    {
      title: 'Account Activity',
      topBorderColor: 'bg-orange-500',
      items: [
        { label: 'Logins', iconName: 'star' },
        { label: 'Password Change', iconName: 'star' },
        { label: 'Accesses', iconName: 'star' },
      ],
    },
  ];

  const sections3 = [
    {
      title: 'Payment',
      topBorderColor: 'bg-green-500',
      items: [
        { label: 'Reports', iconName: 'star' },
        { label: 'Deposit', iconName: 'checkedstar' },
        { label: 'Withdrawal', iconName: 'star' },
      ],
    },
    {
      title: 'Betting Reports',
      topBorderColor: 'bg-yellow-500',
      items: [
        { label: 'Bet Ticket', iconName: 'checkedstar' },
        { label: 'Bets on Sports', iconName: 'star' },
        { label: 'MTS Bet Tickets', iconName: 'star' },
      ],
    },
  ];

  const sections4 = [
    {
      title: 'Bonus',
      topBorderColor: 'bg-cyan-400',
      items: [
        { label: 'Add Bonus', iconName: 'star' },
        { label: 'Reports', iconName: 'checkedstar' },
      ],
    },
    {
      title: 'Aggregated Betting',
      topBorderColor: 'bg-blue-500',
      items: [{ label: 'Bet on Tournaments', iconName: 'star' }],
    },
  ];

  const sections5 = [
    {
      title: 'Live Casino Reports',
      topBorderColor: 'bg-cyan-500',
      items: [
        { label: 'Live Casino by Provider', iconName: 'star' },
        { label: 'Live Casino by Game', iconName: 'checkedstar' },
        { label: 'Live Casino by Bet', iconName: 'star' },
        { label: 'Live Casino Tables Report', iconName: 'star' },
      ],
    },
  ];

  return params.pinned ? (
    <div
      style={{
        height: '441px',
      }}
      className="bg-white p-6 flex gap-4 items-start justify-start overflow-auto"
    ></div>
  ) : (
    <div
      style={{
        height: '441px',
      }}
      className="bg-gray-300 p-6 flex gap-4 items-start justify-start overflow-auto"
    >
      {sections.map((section, index) => (
        <MasterDetailCard key={index} section={section} />
      ))}
      {/* <div className="flex flex-col gap-4 items-start">
        {sections2.map((section, index) => (
          <MasterDetailCard key={index} section={section} />
        ))}
      </div> */}
      <div className="flex flex-col gap-4 items-start">
        {sections3.map((section, index) => (
          <MasterDetailCard key={index} section={section} />
        ))}
      </div>
      <div className="flex flex-col gap-4 items-start">
        {sections4.map((section, index) => (
          <MasterDetailCard key={index} section={section} />
        ))}
      </div>
      {sections5.map((section, index) => (
        <MasterDetailCard key={index} section={section} />
      ))}
    </div>
  );
}

export default DetailCellRenderer;
