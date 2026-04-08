type Permission = {
  resource: string;
  action: string;
  condition: boolean;
};

type PermissionGroup = {
  category: string;
  rules: Permission[];
};

export function extractPermissionGroups(rawPermissions: any[]): PermissionGroup[] {
  return Array.isArray(rawPermissions)
    ? rawPermissions.reduce((acc: PermissionGroup[], item) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          'rules' in item &&
          'category' in item &&
          Array.isArray(item.rules)
        ) {
          acc.push(item as PermissionGroup);
        }
        return acc;
      }, [])
    : [];
}

export function checkPermission(permissionGroups: PermissionGroup[], permKey: string): boolean {
  return permissionGroups.some((group) =>
    group.rules.some(
      (perm: Permission) => `${perm.resource}.${perm.action}` === permKey && perm.condition
    )
  );
}
