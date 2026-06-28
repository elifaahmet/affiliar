import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BanknotesIcon,
  DocumentTextIcon,
  ChartBarIcon,
  CodeBracketIcon,
  GiftIcon,
  MegaphoneIcon,
  Squares2X2Icon,
  UserCircleIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Icon from '@components/core-components/icon';
import cx from 'classnames';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';
import { storageHelper } from 'utils/storage/StorageHelper';

import UserProfile from './UserProfile';
import NotificationBell from './NotificationBell';
import AffiliarAgent from './AffiliarAgent';

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface NavItem {
  key: string;
  label: string;
  href: string;
  Icon: IconComponent;
}

const NAV: NavItem[] = [
  { key: 'dashboard',     label: 'Dashboard',       href: '/affiliate/dashboard',      Icon: Squares2X2Icon },
  { key: 'reports',       label: 'Reports',         href: '/affiliate/reports',        Icon: ChartBarIcon },
  { key: 'players',       label: 'Players',         href: '/affiliate/players',        Icon: UsersIcon },
  { key: 'marketing',     label: 'Marketing Tools', href: '/affiliate/marketing',      Icon: MegaphoneIcon },
  { key: 'commission',    label: 'Commission',      href: '/affiliate/commission',     Icon: BanknotesIcon },
  { key: 'bonus-offers',  label: 'Bonuses',         href: '/affiliate/bonus-offers',   Icon: GiftIcon },
  { key: 'statements',    label: 'Statements',      href: '/affiliate/statements',     Icon: DocumentTextIcon },
  { key: 'sub-affiliate', label: 'Sub-Affiliates',  href: '/affiliate/sub-affiliates', Icon: UserGroupIcon },
  { key: 'api-access',    label: 'API Access',      href: '/affiliate/api-access',     Icon: CodeBracketIcon },
  { key: 'profile',       label: 'Profile',         href: '/affiliate/profile',        Icon: UserCircleIcon },
];

export default function AffiliateDashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const sidebarRef  = useRef<HTMLDivElement>(null);
  const hoverTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pathname } = useLocation();
  const dispatch  = useAppDispatch();
  const { isAuthenticated } = useAppSelector((s) => s.auth);
  const userId = storageHelper.getStoreWithDecryption('userId');

  const logout = useCallback(() => { dispatch(logoutUser()); }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated || !userId) logout();
  }, [isAuthenticated, logout, userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setCollapsed(true);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const onEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setCollapsed(false);
  };
  const onLeave = () => {
    hoverTimer.current = setTimeout(() => setCollapsed(true), 200);
  };

  const sidebarCls = cx(
    'h-full overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out absolute z-50',
    'bg-gradient-to-b from-violet-100/85 via-violet-50/80 to-white/70 backdrop-blur-xl',
    'border-r border-violet-200/60',
    'p-5',
    {
      'w-[78px]': collapsed,
      'sm:w-1/2 md:w-1/3 lg:w-[240px]': !collapsed,
    },
  );

  const linkCls = (current: boolean) =>
    cx(
      'group flex w-full items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
      {
        'justify-center': collapsed,
        'bg-primary text-white shadow-sm shadow-primary/20': current,
        'text-gray-600 hover:bg-violet-200/40 hover:text-violet-900': !current,
      },
    );

  return (
    <div
      className='flex h-screen w-full overflow-hidden'
      style={{
        backgroundImage: `
          radial-gradient(60% 50% at 0% 0%, rgba(139, 92, 246, 0.10) 0%, rgba(139, 92, 246, 0) 60%),
          radial-gradient(50% 40% at 100% 100%, rgba(124, 58, 237, 0.06) 0%, rgba(124, 58, 237, 0) 60%),
          linear-gradient(180deg, #fafaff 0%, #ffffff 100%)
        `,
      }}
    >
      <div
        ref={sidebarRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={sidebarCls}
        role='navigation'
      >
        <div className='mb-8 flex h-9 items-center px-1'>
          {collapsed ? (
            <Icon iconName='affiliarMark' className='shrink-0' svgProps={{ width: 36, height: 36 }} />
          ) : (
            <Icon iconName='affiliarDark' className='shrink-0' svgProps={{ width: 130, height: 28 }} />
          )}
        </div>

        <nav className='flex flex-1 flex-col'>
          <ul className='space-y-1'>
            {NAV.map(({ key, label, href, Icon: NavIcon }) => {
              const current = pathname.startsWith(href);
              return (
                <li key={key}>
                  <Link to={href} className={linkCls(current)}>
                    <NavIcon className='h-5 w-5 shrink-0 stroke-[1.6]' aria-hidden='true' />
                    {!collapsed && <span className='truncate'>{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className='flex-grow flex flex-col relative ml-[78px] overflow-y-auto'>
        <div className='fixed top-0 right-0 left-[78px] z-10 flex h-[60px] items-center justify-between border-b border-violet-100 bg-white/70 pl-8 backdrop-blur-md'>
          <p className='text-sm font-semibold text-gray-700'>
            {NAV.find((n) => pathname.startsWith(n.href))?.label ?? 'Affiliate Panel'}
          </p>
          <div className='flex items-center gap-3 pr-8'>
            <NotificationBell />
            <UserProfile />
          </div>
        </div>
        <div className='h-[calc(100vh-65px)] mt-[60px]'>{children}</div>
      </div>
      <AffiliarAgent role="affiliate" />
    </div>
  );
}
