const today = new Date();
export const tabsData = [
  {
    label: 'Today',
    value: {
      startDate: new Date(),
      endDate: new Date(),
    },
  },
  {
    label: 'Yesterday',
    value: {
      startDate: new Date(new Date().setDate(new Date().getDate() - 1)),
      endDate: new Date(new Date().setDate(new Date().getDate() - 1)),
    },
  },
  {
    label: 'This week',
    value: {
      startDate: new Date(new Date().setDate(new Date().getDate() - 6)),
      endDate: new Date(),
    },
  },
  {
    label: 'Last week',
    value: {
      startDate: new Date(new Date().setDate(new Date().getDate() - 13)),
      endDate: new Date(
        new Date(new Date().setDate(new Date().getDate() - 13)).setDate(
          new Date().getDate() - 13 + 6
        )
      ),
    },
  },
  {
    label: 'This Month',
    value: {
      startDate: new Date(today.getFullYear(), today.getMonth(), 1),
      endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    },
  },
  {
    label: 'Last Month',
    value: {
      startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      endDate: new Date(today.getFullYear(), today.getMonth(), 0),
    },
  },
  {
    label: 'Custom',
    value: {
      startDate: new Date(new Date().setDate(new Date().getDate() - 13)),
      endDate: new Date(),
    },
  },
];
