import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import PlatformOperators from './operators';
import PlatformOperatorsNew from './operators-new';

export const platformRoutes: AppRouteProps[] = [
  {
    path: 'platform',
    element: <Outlet />,
    children: [
      { path: '', element: <PlatformOperators /> },
      { path: 'operators', element: <PlatformOperators /> },
      { path: 'operators/new', element: <PlatformOperatorsNew /> },
    ],
  },
];
