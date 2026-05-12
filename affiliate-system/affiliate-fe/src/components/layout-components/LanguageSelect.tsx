import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

import { useTranslate } from '../../utils/locales/use-locales';

const LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' },
] as const;

const LanguageSelect = () => {
  const language = localStorage.getItem('i18nextLng');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language?.toUpperCase() || 'EN');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { onChangeLang } = useTranslate();

  const toggleDropdown = () => setIsOpen(!isOpen);
  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    setIsOpen(false);
    onChangeLang(code.toLowerCase());
    localStorage.setItem('i18nextLng', code.toLowerCase());
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        type="button"
        className="group inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-700 transition-colors hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={toggleDropdown}
      >
        <GlobeAltIcon className="h-4 w-4 stroke-[1.6]" aria-hidden="true" />
        <span>{selectedLanguage}</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-48 origin-top-right overflow-hidden rounded-xl border border-violet-100 bg-white/95 shadow-xl shadow-violet-200/30 backdrop-blur-md focus:outline-none"
          role="menu"
          aria-orientation="vertical"
        >
          <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
            Language
          </p>
          <div className="p-1 pt-0">
            {LANGUAGES.map((opt) => {
              const active = selectedLanguage === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleLanguageChange(opt.code)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-violet-50 text-violet-900 font-medium'
                      : 'text-gray-700 hover:bg-violet-50 hover:text-violet-900'
                  }`}
                  role="menuitem"
                >
                  <span className="text-left flex-1">{opt.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                    {opt.code}
                  </span>
                  {active && <CheckIcon className="h-4 w-4 stroke-[2] text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelect;
