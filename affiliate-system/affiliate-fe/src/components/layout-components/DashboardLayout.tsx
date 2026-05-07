import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import {
  AdjustmentsHorizontalIcon,
  BanknotesIcon,
  BuildingStorefrontIcon,
  ChartBarSquareIcon,
  Cog6ToothIcon,
  HeartIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Icon from '@components/core-components/icon';
import cx from 'classnames';
import { getBrandingConfig } from 'config/brandConfig';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';
import { storageHelper } from 'utils/storage/StorageHelper';

import { useTranslate } from '../../utils/locales/use-locales';

import BreadCrumb from './BreadCrumb';
import LanguageSelect from './LanguageSelect';
import UserProfile from './UserProfile';

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface NavigationItem {
  key: string;
  name: string;
  href: string;
  Icon: IconComponent;
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
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (navCollapsed) setNavCollapsed(false);
  };

  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      if (!navCollapsed) setNavCollapsed(true);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigation: NavigationItem[] = [
    {
      key: 'dashboard',
      name: t('menuItems.dashboard') || 'Dashboard',
      href: '/dashboard',
      Icon: Squares2X2Icon,
      current: pathname === '/dashboard' || pathname === '/',
    },
    {
      key: 'players',
      name: t('menuItems.players') || 'Players',
      href: '/players/list',
      Icon: UsersIcon,
      current: pathname.startsWith('/players'),
    },
    {
      key: 'affiliates',
      name: t('menuItems.affiliates') || 'Affiliates',
      href: '/affiliates',
      Icon: UserGroupIcon,
      current: pathname.startsWith('/affiliates'),
    },
    {
      key: 'reports',
      name: t('menuItems.reports') || 'Reports',
      href: '/reports',
      Icon: ChartBarSquareIcon,
      current: pathname.startsWith('/reports'),
    },
    {
      key: 'brands',
      name: t('menuItems.brands') || 'Brands',
      href: '/brands',
      Icon: BuildingStorefrontIcon,
      current: pathname.startsWith('/brands'),
    },
    {
      key: 'commission',
      name: t('menuItems.commission') || 'Commission',
      href: '/commission',
      Icon: BanknotesIcon,
      current: pathname.startsWith('/commission'),
    },
    {
      key: 'fees',
      name: t('menuItems.fees') || 'Fees',
      href: '/fees',
      Icon: AdjustmentsHorizontalIcon,
      current: pathname.startsWith('/fees'),
    },
    {
      key: 'refer-a-friend',
      name: t('menuItems.referAFriend') || 'Refer-a-Friend',
      href: '/refer-a-friend',
      Icon: HeartIcon,
      current: pathname.startsWith('/refer-a-friend'),
    },
    {
      key: 'settings',
      name: t('menuItems.settings') || 'Settings',
      href: '/settings',
      Icon: Cog6ToothIcon,
      current: pathname.startsWith('/settings'),
    },
  ];

  // Frosted violet glass sidebar — translucent so the body bg tints
  // through, with a soft right border to separate from the main area.
  const sidebarClassNames = cx(
    'h-full overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out absolute z-50',
    'bg-gradient-to-b from-violet-100/85 via-violet-50/80 to-white/70 backdrop-blur-xl',
    'border-r border-violet-200/60',
    'p-5',
    {
      'w-[78px]': navCollapsed,
      'sm:w-1/2 md:w-1/3 lg:w-[240px]': !navCollapsed,
    },
  );

  const contentClassNames = cx('flex-grow flex flex-col relative ml-[78px] overflow-y-auto');

  const anchorClassName = (current: boolean) =>
    cx(
      'group flex w-full items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
      {
        'justify-center': navCollapsed,
        // Active: solid violet pill — primary token
        'bg-primary text-white shadow-sm shadow-primary/20': current,
        // Idle: warm gray that picks up violet on hover
        'text-gray-600 hover:bg-violet-200/40 hover:text-violet-900': !current,
      },
    );

  const breadcrumbs = (() => {
    if (pathname === '/') return [{ name: 'Home', href: '/', current: true }];

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
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{
        backgroundImage: `
          radial-gradient(60% 50% at 0% 0%, rgba(139, 92, 246, 0.10) 0%, rgba(139, 92, 246, 0) 60%),
          radial-gradient(50% 40% at 100% 100%, rgba(124, 58, 237, 0.06) 0%, rgba(124, 58, 237, 0) 60%),
          linear-gradient(180deg, #fafaff 0%, #ffffff 100%)
        `,
      }}
    >
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
          if (e.key === 'Enter' || e.key === ' ') setNavCollapsed(!navCollapsed);
        }}
      >
        <div className="mb-8 flex h-9 items-center px-1">
          {navCollapsed ? (
            <Icon iconName="affiliarMark" className="shrink-0" svgProps={{ width: 36, height: 36 }} />
          ) : (
            <Icon iconName="affiliarDark" className="shrink-0" svgProps={{ width: 130, height: 28 }} />
          )}
        </div>

        <nav className="flex flex-1 flex-col">
          <ul className="space-y-1">
            {navigation.map(({ key, name, href, Icon: NavIcon, current }) => (
              <li key={key}>
                <Link to={href} className={anchorClassName(current)}>
                  <NavIcon
                    className={cx('h-5 w-5 shrink-0', {
                      'stroke-[1.6]': true,
                    })}
                    aria-hidden="true"
                  />
                  {!navCollapsed && <span className="truncate">{name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={contentClassNames}>
        <div className="fixed top-0 right-0 left-[78px] z-10 flex h-[60px] items-center justify-between border-b border-violet-100 bg-white/70 pl-8 backdrop-blur-md">
          <BreadCrumb pages={breadcrumbs} />
          <div className="relative flex items-center gap-2 pr-8">
            <LanguageSelect />
            <span className="mx-1 h-5 w-px bg-violet-100" aria-hidden="true" />
            <UserProfile />
          </div>
        </div>
        <div className="mt-[60px] h-[calc(100vh-65px)]">{children}</div>
      </div>
    </div>
  );
}
