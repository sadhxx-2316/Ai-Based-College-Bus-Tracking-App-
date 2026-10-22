/**
 * Resolves the backend API base URL with sanitization:
 * 1. Checks runtime localStorage override (allows dynamic connection from live Vercel deployments)
 * 2. Checks build-time import.meta.env.VITE_API_BASE_URL
 * 3. Strips trailing slashes and redundant /api suffixes
 */
export function getApiBaseUrl(): string {
  let base = '';
  if (typeof window !== 'undefined') {
    base = localStorage.getItem('API_BASE_URL') || '';
  }
  if (!base) {
    base = import.meta.env.VITE_API_BASE_URL || '';
  }

  base = base.trim().replace(/\/+$/, '');
  if (base.endsWith('/api')) {
    base = base.substring(0, base.length - 4);
  }
  return base;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem('API_BASE_URL', clean);
    } else {
      localStorage.removeItem('API_BASE_URL');
    }
  }
}

export const API_BASE = getApiBaseUrl();

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const base = getApiBaseUrl();
  const isRemoteDeployment = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (!base && isRemoteDeployment && !endpoint.startsWith('http')) {
    throw new ApiError(
      503,
      'Backend URL is not configured. Please enter your Render backend URL in the "Connect Backend" bar above, or configure VITE_API_BASE_URL in Vercel settings and redeploy.'
    );
  }

  // Prepend /api if not present and construct URL
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${base}${normalizedEndpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr: any) {
    throw new ApiError(
      0,
      `Cannot connect to backend (${url}). Please ensure your backend server (e.g. on Render) is running and accessible.`
    );
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    let errData = null;
    try {
      errData = await response.json();
      if (errData.detail) {
        errorDetail = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch {
      if (response.status === 404) {
        errorDetail = `Backend endpoint not found (404) at ${url}. Check your backend service status and ensure the API path is correct.`;
      }
    }
    throw new ApiError(response.status, errorDetail, errData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
