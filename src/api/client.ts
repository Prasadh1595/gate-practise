// The app is served by the same local server as the API, so all URLs are same-origin.
// (During `npm run dev`, vite.config.ts proxies /api and /assets to the server.)
const API_BASE = '';

function getToken(): string | null {
  return localStorage.getItem('sessionToken');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['x-session-token'] = token;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
    // Session no longer valid (expired / database replaced): go back to the login screen.
    localStorage.removeItem('sessionToken');
    if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/signup')) location.href = '/login';
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  get: (path: string) => request(path, { method: 'GET' }),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown) => request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};

export function assetUrl(path: string) {
  return `${API_BASE}/${path.replace(/^\/+/, '')}`;
}

export { getToken, API_BASE };
