import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Commission from './index';

export const commissionRoutes: AppRouteProps[] = [
  {
    path: 'commission',
    element: <Outlet />,
    children: [{ path: '', element: <Commission /> }],
  },
];
