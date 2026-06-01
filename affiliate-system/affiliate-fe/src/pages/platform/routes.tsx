import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import PlatformOperators from './operators';
import PlatformOperatorsNew from './operators-new';
import PlatformOperatorDetail from './operator-detail';
import PlatformReports from './reports';
import PlatformAffiliates from './affiliates';
import PlatformPayouts from './payouts';

export const platformRoutes: AppRouteProps[] = [
  {
    path: 'platform',
    element: <Outlet />,
    children: [
      { path: '', element: <PlatformOperators /> },
      { path: 'operators', element: <PlatformOperators /> },
      { path: 'operators/new', element: <PlatformOperatorsNew /> },
      { path: 'operators/:id', element: <PlatformOperatorDetail /> },
      { path: 'reports', element: <PlatformReports /> },
      { path: 'affiliates', element: <PlatformAffiliates /> },
      { path: 'payouts', element: <PlatformPayouts /> },
    ],
  },
];
