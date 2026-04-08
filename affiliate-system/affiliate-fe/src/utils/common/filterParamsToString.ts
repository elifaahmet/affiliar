import { formatTzOffset, getGlobalTimezone } from 'utils/timezone';

export const filterParamsToString = (params: Record<string, any>) => {
  const entries = Object.entries(params);
  const hasDateRange = entries.some(
    ([k]) =>
      k === 'startDate' || k === 'endDate' || k === 'registerStartDate' || k === 'registerEndDate'
  );
  const hasTz = entries.some(([k]) => k === 'tz');
  const withTz =
    hasDateRange && !hasTz
      ? [...entries, ['tz', formatTzOffset(getGlobalTimezone().offsetMinutes)]]
      : entries;

  return withTz
    .map(
      ([k, v]) =>
        `${k}=${encodeURIComponent(
          typeof v === 'object' && v !== null ? ((v as any).id ?? (v as any).value) : v
        )}`
    )
    .join('&');
};
