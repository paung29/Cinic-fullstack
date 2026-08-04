// Template for the Eden static-host Worker. stamp-worker.mjs replaces the two
// two EDEN placeholders from the generated CSP artifacts in apps/pos/out and
// writes worker.generated.js. Header logic is a line-for-line mirror of
// tests/e2e/static-server.mjs â€” the production host must send exactly what the
// e2e host proves, nothing more.
const ROUTE_HEADERS = __EDEN_ROUTE_HEADERS__;
const UNION_HEADER = __EDEN_UNION_HEADER__;

const routeForPath = (pathname) => {
  if (pathname === '' || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return fetch(request);
    const response = await env.ASSETS.fetch(request);
    if (response.status >= 300 && response.status < 400) return response;
    const headers = new Headers(response.headers);
    const pathname = url.pathname;
    const contentType = headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html');
    if (pathname.endsWith('.txt')) headers.set('content-type', 'text/x-component');
    if (pathname.endsWith('.webmanifest')) headers.set('content-type', 'application/manifest+json');
    if (isHtml) {
      headers.set('content-security-policy', ROUTE_HEADERS[routeForPath(pathname)] ?? UNION_HEADER);
    }
    if (isHtml || pathname.endsWith('.txt') || pathname === '/sw.js' || pathname === '/manifest.webmanifest') {
      headers.set('cache-control', 'no-cache');
    }
    if (pathname.startsWith('/_next/static/')) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
