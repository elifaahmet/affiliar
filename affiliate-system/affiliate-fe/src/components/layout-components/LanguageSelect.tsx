import React, { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import Icon from '@components/core-components/icon';

import { useTranslate } from '../../utils/locales/use-locales';

const LanguageSelect = () => {
  const language = localStorage.getItem('i18nextLng');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language?.toUpperCase() || 'EN');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { onChangeLang } = useTranslate();
  const toggleDropdown = () => setIsOpen(!isOpen);
  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    setIsOpen(false);
    onChangeLang(language.toLowerCase());
    localStorage.setItem('i18nextLng', language.toLowerCase());
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const flagFor = selectedLanguage === 'FR' ? 'FR' : 'UK';

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-100 bg-white/70 px-2.5 text-xs font-semibold text-gray-700 backdrop-blur-sm transition-colors hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        id="options-menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={toggleDropdown}
      >
        <Icon iconName={flagFor} svgProps={{ width: 18, height: 18 }} />
        <span>{selectedLanguage}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-44 origin-top-right rounded-lg border border-violet-100 bg-white/95 p-1 shadow-lg shadow-violet-200/30 backdrop-blur-md focus:outline-none"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="options-menu"
        >
          {[
            { code: 'EN', flag: 'UK', label: 'English' },
            { code: 'FR', flag: 'FR', label: 'Français' },
          ].map((opt) => {
            const active = selectedLanguage === opt.code;
            return (
              <button
                key={opt.code}
                onClick={() => handleLanguageChange(opt.code)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-violet-50 text-violet-900 font-semibold'
                    : 'text-gray-700 hover:bg-violet-50 hover:text-violet-900'
                }`}
                role="menuitem"
              >
                <Icon iconName={opt.flag} svgProps={{ width: 18, height: 18 }} />
                <span className="text-left">{opt.label}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-gray-400">{opt.code}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelect;
