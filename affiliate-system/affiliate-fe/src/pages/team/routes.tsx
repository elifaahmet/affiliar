import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import Team from './index';

export const teamRoutes: AppRouteProps[] = [
  {
    path: 'team',
    element: <Outlet />,
    children: [{ path: '', element: <PlanGate flag='team'><Team /></PlanGate> }],
  },
];
