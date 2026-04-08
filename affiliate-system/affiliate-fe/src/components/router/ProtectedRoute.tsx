/* eslint-disable react/prop-types */
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from 'hooks/redux';
import { checkPermission, extractPermissionGroups } from 'utils/permissions';

interface ProtectedRouteProps {
  requiredPermissions: string[];
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredPermissions, children }) => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const permissionGroups = extractPermissionGroups(permissions);

  const hasPermission = requiredPermissions.every((perm) =>
    checkPermission(permissionGroups, perm)
  );

  if (!hasPermission) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
};

export default ProtectedRoute;
