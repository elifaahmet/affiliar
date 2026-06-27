import { Navigate, Outlet } from 'react-router-dom';
import { ToastProvider } from '@components/core-components/toaster/ToastContext';
import DashboardLayout from '@components/layout-components/DashboardLayout';
import AffiliateDashboardLayout from '@components/layout-components/AffiliateDashboardLayout';
import AuthLayout from '@components/layout-components/auth-layout';
import { CasinoModeProvider } from 'context/CasinoModeContext';

import { useAppRoutes } from '../hooks/router/useAppRoutes';
import { useAppSelector } from 'hooks/redux';

import { dashboardRoutes } from './dashboard/routes';
import { playersRoutes } from './players/routes';
import { profileRoutes } from './profile/routes';
import { affiliatesRoutes } from './affiliates/routes';
import { reportsRoutes } from './reports/routes';
import { brandsRoutes } from './brands/routes';
import { creativesRoutes } from './creatives/routes';
import { bonusCampaignsRoutes } from './bonus-campaigns/routes';
import { commissionRoutes } from './commission/routes';
import { feesRoutes } from './fees/routes';
import { referAFriendRoutes } from './refer-a-friend/routes';
import { billingRoutes } from './billing/routes';
import { payoutsRoutes } from './payouts/routes';
import { teamRoutes } from './team/routes';
import { settingsRoutes } from './settings/routes';
import { platformRoutes } from './platform/routes';
import { registerRoutes } from './register/routes';
import { activateRoutes } from './activate/routes';
import { resetPasswordRoutes } from './reset-password/routes';
import { affiliatePortalRoutes } from './affiliate-portal/routes';

export default function Router() {
  const role = useAppSelector((s) => s.auth.role);

  const operatorTree = [
    {
      path: '/',
      element: (
        <CasinoModeProvider>
          <ToastProvider>
            <DashboardLayout>
              <Outlet />
            </DashboardLayout>
          </ToastProvider>
        </CasinoModeProvider>
      ),
      children: [
        ...dashboardRoutes,
        ...playersRoutes,
        ...profileRoutes,
        ...affiliatesRoutes,
        ...reportsRoutes,
        ...brandsRoutes,
        ...creativesRoutes,
        ...bonusCampaignsRoutes,
        ...commissionRoutes,
        ...feesRoutes,
        ...referAFriendRoutes,
        ...payoutsRoutes,
        ...teamRoutes,
        ...billingRoutes,
        ...settingsRoutes,
        ...platformRoutes,
      ],
    },
    // Auth-flow pages always render through the editorial auth shell,
    // even when an authenticated session is open (someone clicking an
    // invite link while logged in elsewhere shouldn't see the dashboard
    // chrome).
    {
      path: '/',
      element: (
        <AuthLayout>
          <Outlet />
        </AuthLayout>
      ),
      children: [
        ...registerRoutes,
        ...activateRoutes,
        ...resetPasswordRoutes,
      ],
    },
    { path: '*', element: <Navigate to='/' replace /> },
  ];

  const affiliateTree = [
    {
      path: '/',
      element: (
        <ToastProvider>
          <AffiliateDashboardLayout>
            <Outlet />
          </AffiliateDashboardLayout>
        </ToastProvider>
      ),
      children: [
        ...affiliatePortalRoutes,
      ],
    },
    // Auth-flow pages always render through the editorial auth shell,
    // even when an authenticated session is open (someone clicking an
    // invite link while logged in elsewhere shouldn't see the dashboard
    // chrome).
    {
      path: '/',
      element: (
        <AuthLayout>
          <Outlet />
        </AuthLayout>
      ),
      children: [
        ...registerRoutes,
        ...activateRoutes,
        ...resetPasswordRoutes,
      ],
    },
    { path: '*', element: <Navigate to='/affiliate/dashboard' replace /> },
  ];

  return useAppRoutes(role === 'affiliate' ? affiliateTree : operatorTree);
}
