export const currencySymbolMap: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  RUB: '₽',
  CNY: '¥',
  TRY: '₺',
  BDT: '৳',
  HKD: 'HK$',
  AUD: '$',
};

export const currencySymbolList = Object.entries(currencySymbolMap).map(([code, symbol]) => ({
  _id: code,
  label: symbol,
}));

export const getCurrencySymbol = (code?: string | null): string => {
  if (!code) return '';
  return currencySymbolMap[code.toUpperCase()] || '';
};

export const getSupportedCurrencies = (): string[] => {
  const raw = process.env.REACT_APP_SUPPORTED_CURRENCIES;
  const fromEnv =
    raw
      ?.split(',')
      .map((c) => c.trim())
      .filter(Boolean) || [];
  return fromEnv.length > 0 ? fromEnv : Object.keys(currencySymbolMap);
};

export const getSupportedCurrencyOptions = (): { value: string; label: string }[] =>
  getSupportedCurrencies().map((code) => {
    const symbol = getCurrencySymbol(code);
    return {
      value: code,
      label: symbol ? `${code} (${symbol})` : code,
    };
  });

export const convertToEuro = (amount: number, currency: string): number => {
  const rates: Record<string, number> = {
    USD: 0.93,
    EUR: 1,
    TRY: 0.03,
    GBP: 1.14,
    INR: 0.011,
    HKD: 0.12,
    BDT: 0.0085,
  };
  return amount * (rates[currency.toUpperCase()] || 1);
};
