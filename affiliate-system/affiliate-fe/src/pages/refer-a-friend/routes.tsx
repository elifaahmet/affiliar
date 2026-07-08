import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import PlanGate from '@components/core-components/PlanGate';
import ReferAFriendPage from './index';

export const referAFriendRoutes: AppRouteProps[] = [
  {
    path: 'refer-a-friend',
    element: <Outlet />,
    children: [{ path: '', element: <PlanGate flag='referAFriend'><ReferAFriendPage /></PlanGate> }],
  },
];
