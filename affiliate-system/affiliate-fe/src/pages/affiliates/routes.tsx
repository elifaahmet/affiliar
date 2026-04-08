import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Affiliates from './index';

export const affiliatesRoutes: AppRouteProps[] = [
  {
    path: 'affiliates',
    element: <Outlet />,
    children: [{ path: '', element: <Affiliates /> }],
  },
];
