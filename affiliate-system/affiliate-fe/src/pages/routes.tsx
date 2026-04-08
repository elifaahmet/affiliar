import { Navigate, Outlet } from 'react-router-dom';
import { ToastProvider } from '@components/core-components/toaster/ToastContext';
import DashboardLayout from '@components/layout-components/DashboardLayout';
import AffiliateDashboardLayout from '@components/layout-components/AffiliateDashboardLayout';
import { CasinoModeProvider } from 'context/CasinoModeContext';

import { useAppRoutes } from '../hooks/router/useAppRoutes';
import { useAppSelector } from 'hooks/redux';

import { dashboardRoutes } from './dashboard/routes';
import { playersRoutes } from './players/routes';
import { profileRoutes } from './profile/routes';
import { affiliatesRoutes } from './affiliates/routes';
import { reportsRoutes } from './reports/routes';
import { brandsRoutes } from './brands/routes';
import { commissionRoutes } from './commission/routes';
import { settingsRoutes } from './settings/routes';
import { registerRoutes } from './register/routes';
import { activateRoutes } from './activate/routes';
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
        ...commissionRoutes,
        ...settingsRoutes,
      ],
    },
    ...registerRoutes,
    ...activateRoutes,
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
    ...registerRoutes,
    ...activateRoutes,
    { path: '*', element: <Navigate to='/affiliate/dashboard' replace /> },
  ];

  return useAppRoutes(role === 'affiliate' ? affiliateTree : operatorTree);
}
