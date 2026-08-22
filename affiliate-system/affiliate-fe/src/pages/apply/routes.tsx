import { AppRouteProps } from '@components/router/AppRoute';
import OperatorApply from './index';

export const applyRoutes: AppRouteProps[] = [
  {
    path: 'apply',
    element: <OperatorApply />,
  },
];
