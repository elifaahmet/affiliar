import React, { useEffect, useRef, useState } from 'react';
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

  return (
    <div
      ref={dropdownRef}
      className="relative inline-block text-left h-full py-3 justify-center items-center"
    >
      <button
        className="inline-flex items-center justify-center w-full min-w-[86px] h-9 rounded-md px-3 py-2 bg-grayBg text-xs font-bold text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        id="options-menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={toggleDropdown}
      >
        {selectedLanguage === 'EN' && (
          <>
            <Icon iconName="UK" svgProps={{ width: 20, height: 20 }} />
            <span className="mx-2">EN</span>
          </>
        )}
        {selectedLanguage === 'FR' && (
          <>
            <Icon iconName="FR" svgProps={{ width: 20, height: 20 }} />
            <span className="mx-2">FR</span>
          </>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="7"
          viewBox="0 0 12 7"
          fill="none"
        >
          <path
            d="M5.51904 5.96285L5.51904 5.96285L5.52025 5.96393C5.65522 6.08372 5.81681 6.15 6 6.15C6.18047 6.15 6.34957 6.0855 6.48177 5.96211L10.9509 1.91383L10.9509 1.91385L10.953 1.91197C11.0789 1.79357 11.15 1.64236 11.15 1.46524C11.15 1.10635 10.842 0.85 10.4758 0.85C10.2966 0.85 10.1301 0.913514 10.0052 1.0178L10.0051 1.01771L10.0006 1.02184L6 4.65225L1.99942 1.02184L1.99951 1.02175L1.99478 1.0178C1.87053 0.914018 1.70996 0.85 1.52419 0.85C1.158 0.85 0.85 1.10635 0.85 1.46523C0.85 1.64282 0.921547 1.79528 1.05535 1.9143C1.05555 1.91448 1.05576 1.91466 1.05596 1.91485L5.51904 5.96285Z"
            fill="#CECCE4"
            stroke="#CECCE4"
            strokeWidth="0.3"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="options-menu"
        >
          <div className="py-1" role="none">
            <button
              onClick={() => handleLanguageChange('EN')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              role="menuitem"
            >
              <Icon iconName="UK" svgProps={{ width: 20, height: 20 }} />
              <span className="ml-2">EN</span>
            </button>
            <button
              onClick={() => handleLanguageChange('FR')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              role="menuitem"
            >
              <Icon iconName="FR" svgProps={{ width: 20, height: 20 }} />
              <span className="ml-2">FR</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelect;
