import { Navigate, Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import AffiliateDashboard from './dashboard';
import AffiliateMarketing from './marketing';
import AffiliateCommission from './commission';
import AffiliateProfile from './profile';
import AffiliateSubAffiliates from './sub-affiliates';

export const affiliatePortalRoutes: AppRouteProps[] = [
  { path: '/',                          element: <Navigate to='/affiliate/dashboard' replace /> },
  { path: '/affiliate/dashboard',       element: <Outlet />, children: [{ path: '', element: <AffiliateDashboard /> }] },
  { path: '/affiliate/marketing',       element: <Outlet />, children: [{ path: '', element: <AffiliateMarketing /> }] },
  { path: '/affiliate/commission',      element: <Outlet />, children: [{ path: '', element: <AffiliateCommission /> }] },
  { path: '/affiliate/sub-affiliates',  element: <Outlet />, children: [{ path: '', element: <AffiliateSubAffiliates /> }] },
  { path: '/affiliate/profile',         element: <Outlet />, children: [{ path: '', element: <AffiliateProfile /> }] },
  { path: '*',                          element: <Navigate to='/affiliate/dashboard' replace /> },
];
