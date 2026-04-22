import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Fees from './index';

export const feesRoutes: AppRouteProps[] = [
  {
    path: 'fees',
    element: <Outlet />,
    children: [{ path: '', element: <Fees /> }],
  },
];
