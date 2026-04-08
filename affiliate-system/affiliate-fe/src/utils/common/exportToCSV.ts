export interface CSVExportOptions<T> {
  data: T[];
  headers: string[];
  filename?: string;
  rowMapper: (item: T) => any[];
}

export function exportToCSV<T>({
  data,
  headers,
  rowMapper,
  filename = 'export.csv',
}: CSVExportOptions<T>) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const rows = data.map(rowMapper);

  let finalFilename = filename;
  try {
    const isFiltered = window?.sessionStorage?.getItem('csvExportFiltered') === '1';
    if (isFiltered) {
      const dotIndex = filename.lastIndexOf('.');
      finalFilename =
        dotIndex > 0
          ? `${filename.slice(0, dotIndex)}-filtered${filename.slice(dotIndex)}`
          : `${filename}-filtered`;
    }
    window?.sessionStorage?.removeItem('csvExportFiltered');
  } catch {
    // ignore storage failures
  }

  const BOM = '\uFEFF';
  const csvContent =
    BOM +
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', finalFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
