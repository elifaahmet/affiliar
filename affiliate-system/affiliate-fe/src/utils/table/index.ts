function parseToUTC(dateString: string) {
  if (dateString === 'N/A') return '';
  const [datePart, timePart] = dateString.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

export const dateComparator = (filterDate: Date, cellValue: string) => {
  if (!cellValue) return -1;

  const cellDate = parseToUTC(cellValue);
  const startOfFilterDate = new Date(filterDate);
  startOfFilterDate.setHours(0, 0, 0, 0);

  const startOfCellDate = new Date(cellDate);
  startOfCellDate.setHours(0, 0, 0, 0);

  if (startOfCellDate.getTime() === startOfFilterDate.getTime()) {
    return 0;
  }

  return startOfCellDate < startOfFilterDate ? -1 : 1;
};
