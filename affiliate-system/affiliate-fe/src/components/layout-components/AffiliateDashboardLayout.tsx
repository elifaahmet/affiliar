import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import cx from 'classnames';
import { useAppDispatch, useAppSelector } from 'hooks/redux';
import { logoutUser } from 'store/auth/authenticationSlice';
import { storageHelper } from 'utils/storage/StorageHelper';
import UserProfile from './UserProfile';

const NAV = [
  { key: 'dashboard',     label: 'Dashboard',        href: '/affiliate/dashboard',     icon: 'categoryIcon2' },
  { key: 'players',       label: 'Players',           href: '/affiliate/players',       icon: 'players'       },
  { key: 'marketing',     label: 'Marketing Tools',  href: '/affiliate/marketing',     icon: 'referal'       },
  { key: 'commission',    label: 'Commission',        href: '/affiliate/commission',    icon: 'report'        },
  { key: 'sub-affiliate', label: 'Sub-Affiliates',   href: '/affiliate/sub-affiliates',icon: 'userProfile'   },
  { key: 'profile',       label: 'Profile',           href: '/affiliate/profile',       icon: 'settings'      },
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
    'h-full bg-gray-900 p-6 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out absolute z-50',
    { 'w-[82px]': collapsed, 'sm:w-1/2 md:w-1/3 lg:w-[253px]': !collapsed }
  );

  const linkCls = (current: boolean) =>
    cx(
      'flex flex-row w-full items-center group gap-x-3 rounded-md px-4 py-3 text-sm font-normal text-gray-400 whitespace-nowrap',
      {
        'justify-center items-center': collapsed,
        'bg-primary text-white': current,
        'hover:text-gray-300 hover:bg-gray-700': !current,
      }
    );

  return (
    <div className='flex bg-grayBg h-screen w-full overflow-hidden'>
      <div
        ref={sidebarRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={sidebarCls}
        role='navigation'
      >
        {/* Logo */}
        <div className='mb-8'>
          {collapsed ? (
            <div className='flex justify-center'>
              <Icon iconName='affiliarMark' svgProps={{ width: 36, height: 36 }} />
            </div>
          ) : (
            <Icon iconName='affiliar' svgProps={{ width: 140, height: 36 }} />
          )}
        </div>

        <nav className='flex flex-1 flex-col'>
          <ul className='-mx-2 space-y-1'>
            {NAV.map((item) => {
              const current = pathname.startsWith(item.href);
              const fill    = current ? 'white' : '#99A1B7';
              return (
                <li key={item.key}>
                  <Link to={item.href} className={linkCls(current)}>
                    <Icon iconName={item.icon} className='h-5 w-5 shrink-0' svgProps={{ fill }} />
                    {!collapsed && item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Main */}
      <div className='flex-grow flex flex-col relative ml-[85px] overflow-y-auto'>
        {/* Topbar */}
        <div className='shadow-[0px_2px_6px_0px_rgba(0,0,0,0.10)] bg-white h-[60px] flex pl-8 justify-between fixed top-0 right-0 left-[85px] z-10 items-center'>
          <p className='text-sm font-semibold text-gray-700'>
            {NAV.find((n) => pathname.startsWith(n.href))?.label ?? 'Affiliate Panel'}
          </p>
          <div className='flex items-center gap-3 pr-8'>
            <UserProfile />
          </div>
        </div>
        <div className='h-[calc(100vh-65px)] mt-[60px] bg-gray-100'>{children}</div>
      </div>
    </div>
  );
}
