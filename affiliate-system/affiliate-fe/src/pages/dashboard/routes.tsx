import { Outlet } from 'react-router-dom';

import { AppRouteProps } from '../../components/router/AppRoute';

import EditWidgets from './EditWidgets';
import Dashboard from '.';

export const dashboardRoutes: AppRouteProps[] = [
  {
    path: '/dashboard',
    element: <Outlet />,
    children: [{ path: '/dashboard', element: <Dashboard /> }],
  },
  {
    path: '/',
    element: <Outlet />,
    children: [{ path: '/', element: <Dashboard /> }],
  },
  {
    path: '/dashboard/edit-widgets',
    element: <Outlet />,
    children: [{ path: '/dashboard/edit-widgets', element: <EditWidgets /> }],
  },
];
