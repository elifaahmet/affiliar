import { Navigate, Route } from 'react-router-dom';

export interface AppRouteProps {
  path: string;
  element: React.ReactElement;
  requiresAuth?: boolean;
  requiredPermissions?: string[];
  children?: AppRouteProps[];
}

export const AppRoute = ({
  requiresAuth = true,
  requiredPermissions = [],
  ...props
}: AppRouteProps) => {
  const isAuthenticated = localStorage.getItem('token');
  const permissions = JSON.parse(localStorage.getItem('permissions') || '[]');

  if (requiresAuth && !isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (
    requiresAuth &&
    requiredPermissions.length > 0 &&
    !requiredPermissions.every((p) => permissions.includes(p))
  ) {
    return null;
  }

  return <Route path={props.path} element={props.element} />;
};
