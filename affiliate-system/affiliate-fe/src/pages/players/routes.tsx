import { Outlet } from 'react-router-dom';

import { AppRouteProps } from '../../components/router/AppRoute';

import EditOverviewdWidgets from './details/tabs/overview/components/EditOverviewWidgets';
import Details from './details';
import Players from './index';

export const playersRoutes: AppRouteProps[] = [
  {
    path: 'players',
    element: <Outlet />,
    children: [
      { path: 'list', element: <Players /> },
      { path: 'list/detail/:id', element: <Details /> },
      {
        path: 'list/detail/overview-edit-widgets',
        element: <EditOverviewdWidgets />,
      },
    ],
  },
];
