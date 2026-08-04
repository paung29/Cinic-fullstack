export function readApiBaseUrl(value = process.env.NEXT_PUBLIC_EDEN_API_BASE_URL): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL is required.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must be a valid HTTP(S) origin.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must use HTTP(S).');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must not include credentials.');
  }
  if (url.search !== '') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must not include a query string.');
  }
  if (url.hash !== '') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must not include a hash.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL must be an origin without a path.');
  }

  return url.origin;
}
