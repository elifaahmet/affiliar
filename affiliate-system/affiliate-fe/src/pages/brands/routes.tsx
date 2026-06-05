import { Outlet } from 'react-router-dom';
import { AppRouteProps } from '../../components/router/AppRoute';
import Brands from './index';
import BrandDetail from './Detail';

export const brandsRoutes: AppRouteProps[] = [
  {
    path: 'brands',
    element: <Outlet />,
    children: [
      { path: '', element: <Brands /> },
      { path: ':id', element: <BrandDetail /> },
    ],
  },
];
