import { AppRouteProps } from '@components/router/AppRoute';
import CreativesPage from './index';

export const creativesRoutes: AppRouteProps[] = [
  {
    path: 'creatives',
    element: <CreativesPage />,
  },
];
