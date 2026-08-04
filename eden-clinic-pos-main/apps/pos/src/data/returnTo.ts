export type SafeReturnTarget = '/sale' | '/calendar' | `/clients${string}`;

export function safeReturnTo(value: string | null): SafeReturnTarget {
  if (value === '/sale' || value === '/calendar') {
    return value;
  }
  if (value === null || value.startsWith('//') || !value.startsWith('/clients')) {
    return '/sale';
  }

  const parsed = new URL(value, 'https://eden.local');
  if (parsed.origin !== 'https://eden.local' || parsed.pathname !== '/clients') {
    return '/sale';
  }

  return `/clients${parsed.search}`;
}

export function returnToAfterSignIn(isDeviceSetup: boolean, value: string | null): SafeReturnTarget | undefined {
  return isDeviceSetup ? undefined : safeReturnTo(value);
}
