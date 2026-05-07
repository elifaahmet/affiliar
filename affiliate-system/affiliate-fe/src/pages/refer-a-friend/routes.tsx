import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import ReferAFriendPage from './index';

export const referAFriendRoutes: AppRouteProps[] = [
  {
    path: 'refer-a-friend',
    element: <Outlet />,
    children: [{ path: '', element: <ReferAFriendPage /> }],
  },
];
