import { Navigate, Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import AffiliateDashboard from './dashboard';
import AffiliateReports from './reports';
import AffiliateMarketing from './marketing';
import AffiliateCommission from './commission';
import AffiliateStatements from './statements';
import AffiliatePlayers from './players';
import AffiliateProfile from './profile';
import AffiliateSubAffiliates from './sub-affiliates';
import AffiliateApiAccess from './api-access';
import AffiliateBonusOffers from './bonus-offers';

export const affiliatePortalRoutes: AppRouteProps[] = [
  { path: '/',                          element: <Navigate to='/affiliate/dashboard' replace /> },
  { path: '/affiliate/dashboard',       element: <Outlet />, children: [{ path: '', element: <AffiliateDashboard /> }] },
  { path: '/affiliate/reports',         element: <Outlet />, children: [{ path: '', element: <AffiliateReports /> }] },
  { path: '/affiliate/marketing',       element: <Outlet />, children: [{ path: '', element: <AffiliateMarketing /> }] },
  { path: '/affiliate/players',         element: <Outlet />, children: [{ path: '', element: <AffiliatePlayers /> }] },
  { path: '/affiliate/commission',      element: <Outlet />, children: [{ path: '', element: <AffiliateCommission /> }] },
  { path: '/affiliate/bonus-offers',    element: <Outlet />, children: [{ path: '', element: <AffiliateBonusOffers /> }] },
  { path: '/affiliate/statements',      element: <Outlet />, children: [{ path: '', element: <AffiliateStatements /> }] },
  { path: '/affiliate/sub-affiliates',  element: <Outlet />, children: [{ path: '', element: <AffiliateSubAffiliates /> }] },
  { path: '/affiliate/profile',         element: <Outlet />, children: [{ path: '', element: <AffiliateProfile /> }] },
  { path: '/affiliate/api-access',      element: <Outlet />, children: [{ path: '', element: <PlanGate flag='apiAccess'><AffiliateApiAccess /></PlanGate> }] },
  { path: '*',                          element: <Navigate to='/affiliate/dashboard' replace /> },
];
