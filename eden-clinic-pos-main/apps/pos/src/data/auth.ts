import {
  apiErrorSchema,
  emailLoginSchema,
  loginResponseSchema,
  loginSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  setupRequestSchema,
  setupResponseSchema,
  type EmailLoginWire,
  type LoginResponseWire,
  type LoginWire,
  type RefreshResponseWire,
  type SetupRequestWire,
  type SetupResponseWire,
} from '@/data/types';
import { ApiHttpError, ApiNetworkError } from '@/data/api';

export type AuthClient = {
  login(input: LoginWire): Promise<LoginResponseWire>;
  /** Optional so a mock or an older server can omit it without breaking sign-in. */
  loginWithEmail?(input: EmailLoginWire): Promise<LoginResponseWire>;
  refresh(refreshToken: string): Promise<RefreshResponseWire>;
  setup?(input: SetupRequestWire): Promise<SetupResponseWire>;
  logout?(refreshToken: string): Promise<void>;
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

  async function requestNoContent(path: string, body: unknown): Promise<void> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ApiNetworkError('Network request failed.', { cause: error });
    }
    if (!response.ok) {
      const error = apiErrorSchema.parse(await response.json());
      throw new ApiHttpError(error.status, error.code, error.message);
    }
  }

  return {
    login(input) {
      return request('/auth/login', loginSchema.parse(input), loginResponseSchema.parse);
    },
    loginWithEmail(input) {
      return request('/auth/login-email', emailLoginSchema.parse(input), loginResponseSchema.parse);
    },
    refresh(refreshToken) {
      return request('/auth/refresh', refreshRequestSchema.parse({ refresh: refreshToken }), refreshResponseSchema.parse);
    },
    setup(input) {
      return request('/api/setup', setupRequestSchema.parse(input), setupResponseSchema.parse);
    },
    logout(refreshToken) {
      return requestNoContent('/auth/logout', { refresh: refreshToken });
    },
  };
}
