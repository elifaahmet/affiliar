import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Commission, { PlanFormPage } from './index';

export const commissionRoutes: AppRouteProps[] = [
  {
    path: 'commission',
    element: <Outlet />,
    children: [
      { path: '',          element: <Commission /> },
      // Plan create + edit live on their own pages (commission plans are
      // critical config — a stray click on the backdrop shouldn't dismiss
      // half-typed input).
      { path: 'new',       element: <PlanFormPage /> },
      { path: ':id/edit',  element: <PlanFormPage /> },
    ],
  },
];
