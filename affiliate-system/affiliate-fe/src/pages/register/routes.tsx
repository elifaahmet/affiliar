import { AppRouteProps } from '@components/router/AppRoute';
import AffiliateRegister from './index';

export const registerRoutes: AppRouteProps[] = [
  {
    path: 'register',
    element: <AffiliateRegister />,
  },
];
