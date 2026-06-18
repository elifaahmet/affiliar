import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Team from './index';

export const teamRoutes: AppRouteProps[] = [
  {
    path: 'team',
    element: <Outlet />,
    children: [{ path: '', element: <Team /> }],
  },
];
