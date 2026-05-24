import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Payouts from './index';

export const payoutsRoutes: AppRouteProps[] = [
  {
    path: 'payouts',
    element: <Outlet />,
    children: [{ path: '', element: <Payouts /> }],
  },
];
