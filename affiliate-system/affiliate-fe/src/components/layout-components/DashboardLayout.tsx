import { ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import cx from 'classnames';
import { getBrandingConfig } from 'config/brandConfig';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';
import { storageHelper } from 'utils/storage/StorageHelper';

import { useTranslate } from '../../utils/locales/use-locales';

import BreadCrumb from './BreadCrumb';
import LanguageSelect from './LanguageSelect';
import TimezoneSelect from './TimezoneSelect';
import UserProfile from './UserProfile';

interface NavigationItem {
  key: string;
  name: string;
  href: string;
  icon: ReactElement;
  current: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { t } = useTranslate();
  const {
    config: { title: appTitle, description: appDescription, favicon },
  } = getBrandingConfig();

  const [navCollapsed, setNavCollapsed] = useState(true);
  const location = useLocation();
  const { pathname } = location;
  const dispatch = useAppDispatch();
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const userId = storageHelper.getStoreWithDecryption('userId');

  const logout = useCallback(() => {
    dispatch(logoutUser());
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      logout();
    }
  }, [isAuthenticated, logout, userId]);

  const handleMouseEnter = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
    }
    if (navCollapsed) {
      setNavCollapsed(false);
    }
  };

  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      if (!navCollapsed) {
        setNavCollapsed(true);
      }
    }, 200);
  };

  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setNavCollapsed(true);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navigation: NavigationItem[] = [
    {
      key: 'dashboard',
      name: t('menuItems.dashboard') || 'Dashboard',
      href: '/dashboard',
      icon: (
        <Icon
          iconName="categoryIcon2"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname === '/dashboard' || pathname === '/' ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname === '/dashboard' || pathname === '/',
    },
    {
      key: 'players',
      name: t('menuItems.players') || 'Players',
      href: '/players/list',
      icon: (
        <Icon
          iconName="players"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/players') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/players'),
    },
    {
      key: 'affiliates',
      name: t('menuItems.affiliates') || 'Affiliates',
      href: '/affiliates',
      icon: (
        <Icon
          iconName="referal"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/affiliates') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/affiliates'),
    },
    {
      key: 'reports',
      name: t('menuItems.reports') || 'Reports',
      href: '/reports',
      icon: (
        <Icon
          iconName="report"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/reports') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/reports'),
    },
    {
      key: 'brands',
      name: t('menuItems.brands') || 'Brands',
      href: '/brands',
      icon: (
        <Icon
          iconName="settings"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/brands') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/brands'),
    },
    {
      key: 'commission',
      name: t('menuItems.commission') || 'Commission',
      href: '/commission',
      icon: (
        <Icon
          iconName="report"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/commission') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/commission'),
    },
    {
      key: 'settings',
      name: t('menuItems.settings') || 'Settings',
      href: '/settings',
      icon: (
        <Icon
          iconName="settings"
          className="h-5 w-5 shrink-0"
          svgProps={{
            fill: pathname.startsWith('/settings') ? 'white' : '#99A1B7',
          }}
        />
      ),
      current: pathname.startsWith('/settings'),
    },
  ];

  const sidebarClassNames = cx(
    'h-full bg-gray-900 p-6 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out absolute z-50',
    {
      'w-[82px]': navCollapsed,
      'sm:w-1/2 md:w-1/3 lg:w-[253px]': !navCollapsed,
    }
  );

  const contentClassNames = cx('flex-grow flex flex-col relative ml-[85px] overflow-y-auto');

  const anchorClassName = (current: boolean) =>
    cx(
      'flex flex-row w-full items-center group gap-x-3 rounded-md px-4 py-3 text-sm font-normal text-gray-400 whitespace-nowrap',
      {
        'justify-center items-center': navCollapsed,
        'bg-primary text-white': current,
        'hover:text-gray-300 hover:bg-gray-700': !current,
      }
    );

  const breadcrumbs = (() => {
    if (pathname === '/') {
      return [{ name: 'Home', href: '/', current: true }];
    }

    const pathnames = pathname.split('/').filter(Boolean);

    return pathnames
      .filter((segment) => !/^\d+$/.test(segment))
      .map((segment, index, arr) => {
        const href = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === arr.length - 1;
        const translationKey = segment.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        return {
          name: t(`menuItems.${translationKey}`) || segment,
          href,
          current: isLast,
        };
      });
  })();

  return (
    <div className="flex bg-grayBg h-screen w-full overflow-hidden">
      <Helmet>
        <title>{appTitle}</title>
        <meta name="description" content={appDescription} />
        <link rel="icon" href={`/${favicon}`} />
      </Helmet>

      <div
        ref={sidebarRef}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        className={sidebarClassNames}
        role="navigation"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setNavCollapsed(!navCollapsed);
          }
        }}
      >
        <div className="mb-8">
          {navCollapsed ? (
            <div className="flex justify-center items-center">
              <Icon
                iconName="affiliarMark"
                className="shrink-0"
                svgProps={{ width: 36, height: 36 }}
              />
            </div>
          ) : (
            <div className="flex justify-start items-center">
              <Icon
                iconName="affiliar"
                className="shrink-0"
                svgProps={{ width: 140, height: 36 }}
              />
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col">
          <ul className="-mx-2 space-y-1">
            {navigation.map((item) => (
              <li key={item.key}>
                <Link to={item.href} className={anchorClassName(item.current)}>
                  {item.icon}
                  {!navCollapsed && item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={contentClassNames}>
        <div className="shadow-[0px_2px_6px_0px_rgba(0,0,0,0.10)] bg-white h-[60px] flex pl-8 justify-between fixed top-0 right-0 left-[85px] z-10">
          <BreadCrumb pages={breadcrumbs} />
          <div className="flex relative items-center gap-3 pr-8">
            <TimezoneSelect />
            <LanguageSelect />
            <UserProfile />
          </div>
        </div>
        <div className="h-[calc(100vh-65px)] mt-[60px] bg-gray-100">{children}</div>
      </div>
    </div>
  );
}
