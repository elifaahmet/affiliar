const DATE_DMY = /^(\d{2})-(\d{2})-(\d{4})$/;
const DATE_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDateOnlyParts = (str) => {
  if (!str) return null;
  const dmy = String(str).match(DATE_DMY);
  if (dmy) {
    return {
      day: Number(dmy[1]),
      month: Number(dmy[2]),
      year: Number(dmy[3]),
    };
  }
  const ymd = String(str).match(DATE_YMD);
  if (ymd) {
    return {
      day: Number(ymd[3]),
      month: Number(ymd[2]),
      year: Number(ymd[1]),
    };
  }
  return null;
};

const parseTzOffset = (tz) => {
  if (!tz) return null;
  const match = String(tz).match(/^([+-])(\d{2})(\d{2})$/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  if (hours > 23 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
};

const parseDateValue = (str, { isEnd, tzOffsetMin }) => {
  if (!str) return { date: null };
  const parts = parseDateOnlyParts(str);
  if (parts) {
    if (tzOffsetMin !== null && tzOffsetMin !== undefined) {
      const utcMs =
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          isEnd ? 23 : 0,
          isEnd ? 59 : 0,
          isEnd ? 59 : 0,
          isEnd ? 999 : 0,
        ) -
        tzOffsetMin * 60 * 1000;
      return { date: new Date(utcMs) };
    }
    const local = new Date(parts.year, parts.month - 1, parts.day);
    if (isEnd) local.setHours(23, 59, 59, 999);
    return { date: local };
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    return { error: "Invalid date format. Use DD-MM-YYYY or YYYY-MM-DD" };
  }
  return { date: d };
};

const buildDateRange = ({ startDate, endDate, tz }) => {
  if (!startDate && !endDate) return { start: null, end: null };

  const tzOffsetMin =
    tz !== undefined && tz !== null && tz !== ""
      ? parseTzOffset(tz)
      : null;
  if (tz && tzOffsetMin === null) {
    return {
      error: "Invalid tz format. Use tz=+HHMM/-HHMM",
      start: null,
      end: null,
    };
  }

  const startRes = parseDateValue(startDate, {
    isEnd: false,
    tzOffsetMin,
  });
  if (startRes.error) {
    return { error: startRes.error, start: null, end: null };
  }
  const endRes = parseDateValue(endDate, {
    isEnd: true,
    tzOffsetMin,
  });
  if (endRes.error) {
    return { error: endRes.error, start: null, end: null };
  }

  return { start: startRes.date || null, end: endRes.date || null };
};

module.exports = { buildDateRange };
