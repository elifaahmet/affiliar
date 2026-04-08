import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export function useTranslate() {
  const { i18n, ready, t } = useTranslation();

  const onChangeLang = useCallback(
    (newlang: string) => {
      i18n.changeLanguage(newlang);
    },
    [i18n]
  );

  return {
    t,
    i18n,
    ready,
    onChangeLang,
  };
}
