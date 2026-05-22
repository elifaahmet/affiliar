import { AppRouteProps } from '../../components/router/AppRoute';

import Billing from './index';

export const billingRoutes: AppRouteProps[] = [
  {
    path: 'billing',
    element: <Billing />,
  },
];
