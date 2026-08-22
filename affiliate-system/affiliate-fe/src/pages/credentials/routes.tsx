import { AppRouteProps } from '@components/router/AppRoute';
import CredentialsReveal from './index';

export const credentialsRoutes: AppRouteProps[] = [
  {
    path: 'credentials/:token',
    element: <CredentialsReveal />,
  },
];
