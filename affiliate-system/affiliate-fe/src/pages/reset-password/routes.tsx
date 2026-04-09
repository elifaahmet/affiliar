import { AppRouteProps } from '../../components/router/AppRoute';
import ResetPassword from './index';

export const resetPasswordRoutes: AppRouteProps[] = [
  { path: 'reset-password', element: <ResetPassword /> },
];
