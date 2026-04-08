import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

let currentLabel = 'GMT+00:00';
let currentOffsetMinutes = 0;

export const setGlobalTimezone = (label: string, offsetMinutes: number) => {
  currentLabel = label;
  currentOffsetMinutes = offsetMinutes;
};

export const getGlobalTimezone = () => ({
  label: currentLabel,
  offsetMinutes: currentOffsetMinutes,
});

export const formatTzOffset = (offsetMinutes: number) => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
};

export const convertDateToTimezone = (value: dayjs.ConfigType) => {
  if (!value) return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  const utcDate = parsed.utc();
  return utcDate.add(currentOffsetMinutes, 'minute');
};

export const formatDateWithTimezone = (value: dayjs.ConfigType, format = 'DD/MM/YYYY') => {
  const converted = convertDateToTimezone(value);
  return converted ? converted.format(format) : '-';
};
