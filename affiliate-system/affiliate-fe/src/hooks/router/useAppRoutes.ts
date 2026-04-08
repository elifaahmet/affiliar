import { useRoutes } from 'react-router-dom';

import { AppRouteProps } from '../../components/router/AppRoute';

export function useAppRoutes(routes: AppRouteProps[]) {
  return useRoutes(
    routes.map((route) => {
      return {
        ...route,
      };
    })
  );
}
