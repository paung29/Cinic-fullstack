import {
  apiErrorSchema,
  loginResponseSchema,
  loginSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  type LoginResponseWire,
  type LoginWire,
  type RefreshResponseWire,
} from '@/data/types';
import { ApiHttpError, ApiNetworkError } from '@/data/api';

export type AuthClient = {
  login(input: LoginWire): Promise<LoginResponseWire>;
  refresh(refreshToken: string): Promise<RefreshResponseWire>;
};

export function createAuthClient(options: { baseUrl: string; fetchFn?: typeof fetch }): AuthClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;

  async function request<T>(path: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
    let response: Response;
    let payload: unknown;

    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      payload = await response.json();
    } catch (error) {
      throw new ApiNetworkError('Network request failed.', { cause: error });
    }

    if (!response.ok) {
      const error = apiErrorSchema.parse(payload);
      throw new ApiHttpError(error.status, error.code, error.message);
    }

    return parse(payload);
  }

  return {
    login(input) {
      return request('/auth/login', loginSchema.parse(input), loginResponseSchema.parse);
    },
    refresh(refreshToken) {
      return request('/auth/refresh', refreshRequestSchema.parse({ refresh: refreshToken }), refreshResponseSchema.parse);
    },
  };
}
