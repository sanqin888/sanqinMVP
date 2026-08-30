export type StaffNavigationMatch = 'exact' | 'section';

function normalizePath(path: string): string {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
}

export function isStaffRouteActive(
  pathname: string,
  href: string,
  match: StaffNavigationMatch = 'section',
): boolean {
  const currentPath = normalizePath(pathname);
  const targetPath = normalizePath(href);

  if (match === 'exact') return currentPath === targetPath;

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}
