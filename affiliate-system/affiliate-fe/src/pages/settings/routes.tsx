import { AppRouteProps } from '../../components/router/AppRoute';

import Settings from './index';

export const settingsRoutes: AppRouteProps[] = [
  {
    path: 'settings',
    element: <Settings />,
  },
];
