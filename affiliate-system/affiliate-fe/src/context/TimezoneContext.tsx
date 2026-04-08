import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { setGlobalTimezone } from '../utils/timezone';

type TimezoneOption = {
  label: string;
  value: string;
};

type TimezoneContextValue = {
  timezone: string;
  offsetMinutes: number;
  options: TimezoneOption[];
  setTimezone: (value: string) => void;
};

const TimezoneContext = createContext<TimezoneContextValue | undefined>(undefined);

const formatOffset = (offsetMinutes: number) => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  return `GMT${sign}${paddedHours}:${paddedMinutes}`;
};

const FULL_HOUR_OFFSETS = Array.from({ length: 27 }, (_, index) => (index - 12) * 60); // -12:00 .. +14:00
const HALF_HOUR_OFFSETS = [
  -570, // -09:30
  -210, // -03:30
  210, // +03:30
  270, // +04:30
  330, // +05:30
  390, // +06:30
  570, // +09:30
  630, // +10:30
];

const TIMEZONE_OPTIONS: TimezoneOption[] = Array.from(
  new Set([...FULL_HOUR_OFFSETS, ...HALF_HOUR_OFFSETS])
)
  .sort((a, b) => a - b)
  .map((offsetMinutes) => {
    const label = formatOffset(offsetMinutes);
    return { label, value: label };
  });

const parseOffsetToMinutes = (value: string) => {
  const match = value.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
};

const getDefaultTimezone = (): string => {
  const stored = localStorage.getItem('admin_timezone');
  if (stored) return stored;

  const offset = new Date().getTimezoneOffset() * -1;
  const hours = Math.trunc(offset / 60);
  const minutes = Math.abs(offset % 60);
  const sign = offset >= 0 ? '+' : '-';
  const formatted = `GMT${sign}${String(Math.abs(hours)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return TIMEZONE_OPTIONS.some((option) => option.value === formatted) ? formatted : 'GMT+00:00';
};

export const TimezoneProvider = ({ children }: { children: React.ReactNode }) => {
  const [timezone, setTimezoneState] = useState<string>(() => getDefaultTimezone());

  const setTimezone = useCallback((value: string) => {
    setTimezoneState(value);
    localStorage.setItem('admin_timezone', value);
    setGlobalTimezone(value, parseOffsetToMinutes(value));
  }, []);

  const value = useMemo<TimezoneContextValue>(() => {
    return {
      timezone,
      offsetMinutes: parseOffsetToMinutes(timezone),
      options: TIMEZONE_OPTIONS,
      setTimezone,
    };
  }, [setTimezone, timezone]);

  useEffect(() => {
    setGlobalTimezone(timezone, parseOffsetToMinutes(timezone));
  }, [timezone]);

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
};

export const useTimezoneContext = () => {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezoneContext must be used within TimezoneProvider');
  }
  return context;
};
