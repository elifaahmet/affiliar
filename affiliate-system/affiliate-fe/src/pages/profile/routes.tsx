import { AppRouteProps } from '../../components/router/AppRoute';

import ProfileDetails from './details';

export const profileRoutes: AppRouteProps[] = [
  {
    path: 'profile/profile-details',
    element: <ProfileDetails />,
  },
];
