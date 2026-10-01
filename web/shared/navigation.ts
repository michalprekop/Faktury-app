export const ADMIN_PATH = '/admin42';

// Authentication may return only to a known local destination.
export function loginDestination(value: string | undefined) {
  return value === ADMIN_PATH ? ADMIN_PATH : '/';
}

export function appleLoginPath(pathname: string) {
  return pathname === ADMIN_PATH ? `/auth/apple?return_to=${ADMIN_PATH}` : '/auth/apple';
}
