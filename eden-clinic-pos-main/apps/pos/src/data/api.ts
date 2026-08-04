import { z } from './zod';
import {
  apiErrorSchema,
  appointmentStatusUpdateSchema,
  appointmentResponseSchema,
  appointmentSchema,
  bootstrapSchema,
  barcodeLookupSchema,
  clinicPatchSchema,
  clinicSchema,
  contactResponseSchema,
  contactSchema,
  deltaSchema,
  elevationResponseSchema,
  loginResponseSchema,
  loginSchema,
  patientResponseSchema,
  patientSchema,
  paymentResponseSchema,
  paymentSchema,
  productResponseSchema,
  productPatchSchema,
  productSchema,
  saleResponseSchema,
  saleSchema,
  stockReceiveResponseSchema,
  stockReceiveSchema,
  type AppointmentResponseWire,
  type AppointmentStatus,
  type AppointmentWire,
  type BootstrapWire,
  type BarcodeLookupWire,
  type ClinicPatchWire,
  type ClinicWire,
  type ContactResponseWire,
  type ContactWire,
  type DeltaWire,
  type ElevationResponseWire,
  type LoginResponseWire,
  type LoginWire,
  type PatientResponseWire,
  type PatientWire,
  type PaymentResponseWire,
  type PaymentWire,
  type ProductResponseWire,
  type ProductPatchWire,
  type ProductWire,
  type SaleResponseWire,
  type SaleWire,
  type StockReceiveResponseWire,
  type StockReceiveWire,
} from '@/data/types';

export interface SessionProvider {
  getAccessToken(): string | undefined | Promise<string | undefined>;
  refresh(): Promise<void>;
  onAuthFailure(): void | Promise<void>;
}

export type OutboxDispatch =
  | { kind: 'sale'; payload: SaleWire }
  | { kind: 'patient'; payload: PatientWire }
  | { kind: 'product'; payload: ProductWire }
  | { kind: 'stockReceive'; payload: StockReceiveWire }
  | { kind: 'appointment'; payload: AppointmentWire }
  | { kind: 'appointmentStatus'; appointmentId: string; payload: { status: AppointmentStatus } }
  | { kind: 'contact'; payload: ContactWire }
  | { kind: 'salePayment'; saleId: string; payload: PaymentWire };

export type OutboxDispatchResult =
  | SaleResponseWire
  | PatientResponseWire
  | ProductResponseWire
  | StockReceiveResponseWire
  | AppointmentResponseWire
  | ContactResponseWire
  | PaymentResponseWire;

export interface ApiClient {
  login(input: LoginWire): Promise<LoginResponseWire>;
  bootstrap(): Promise<BootstrapWire>;
  delta(since: number): Promise<DeltaWire>;
  elevate(input: { password: string; screen: string }): Promise<ElevationResponseWire>;
  updateClinic(input: ClinicPatchWire, elevationToken: string): Promise<ClinicWire>;
  updateProduct(id: string, input: ProductPatchWire, elevationToken: string): Promise<ProductWire>;
  lookupBarcode(code: string): Promise<BarcodeLookupWire>;
  dispatch(item: OutboxDispatch): Promise<OutboxDispatchResult>;
}

export class ApiAuthError extends Error {
  constructor(message = 'Authentication could not be refreshed.') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export class ApiNetworkError extends Error {
  constructor(message = 'Network request failed.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiNetworkError';
  }
}

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions<TSchema extends z.ZodType> = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  schema: TSchema;
  body?: unknown;
  protected: boolean;
  elevationToken?: string;
};

export function createApiClient(options: {
  baseUrl: string;
  fetchFn?: typeof fetch;
  session: SessionProvider;
}): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;
  let refreshPromise: Promise<void> | undefined;
  let authFailurePromise: Promise<void> | undefined;

  function refreshSingleFlight(): Promise<void> {
    if (refreshPromise === undefined) {
      refreshPromise = Promise.resolve(options.session.refresh()).finally(() => {
        refreshPromise = undefined;
      });
    }

    return refreshPromise;
  }

  async function signalAuthFailure(): Promise<never> {
    if (authFailurePromise === undefined) {
      authFailurePromise = Promise.resolve(options.session.onAuthFailure()).catch(() => undefined);
    }

    await authFailurePromise;
    throw new ApiAuthError();
  }

  async function sendRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body: unknown | undefined,
    needsToken: boolean,
    elevationToken: string | undefined,
  ): Promise<{ response: Response; payload: unknown; accessToken: string | undefined }> {
    const accessToken = needsToken ? await options.session.getAccessToken() : undefined;
    const headers = new Headers();
    if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (accessToken !== undefined) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
    if (elevationToken !== undefined) {
      headers.set('x-elevation', elevationToken);
    }

    try {
      const response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload: unknown = await response.json();
      return { response, payload, accessToken };
    } catch (error) {
      throw new ApiNetworkError('Network request failed.', { cause: error });
    }
  }

  async function request<TSchema extends z.ZodType>(requestOptions: RequestOptions<TSchema>): Promise<z.output<TSchema>> {
    const initial = await sendRequest(
      requestOptions.method,
      requestOptions.path,
      requestOptions.body,
      requestOptions.protected,
      requestOptions.elevationToken,
    );

    if (!requestOptions.protected || initial.response.status !== 401) {
      return parseResponse(initial.response, initial.payload, requestOptions.schema);
    }

    apiErrorSchema.parse(initial.payload);

    const currentAccessToken = await options.session.getAccessToken();
    if (currentAccessToken === initial.accessToken) {
      try {
        await refreshSingleFlight();
      } catch {
        return signalAuthFailure();
      }
    }

    if (await options.session.getAccessToken() === undefined) {
      return signalAuthFailure();
    }

    const retry = await sendRequest(
      requestOptions.method,
      requestOptions.path,
      requestOptions.body,
      requestOptions.protected,
      requestOptions.elevationToken,
    );
    if (retry.response.status === 401) {
      apiErrorSchema.parse(retry.payload);
      return signalAuthFailure();
    }

    return parseResponse(retry.response, retry.payload, requestOptions.schema);
  }

  return {
    login(input): Promise<LoginResponseWire> {
      return request({
        method: 'POST',
        path: '/auth/login',
        body: loginSchema.parse(input),
        schema: loginResponseSchema,
        protected: false,
      });
    },
    bootstrap(): Promise<BootstrapWire> {
      return request({ method: 'GET', path: '/bootstrap', schema: bootstrapSchema, protected: true });
    },
    delta(since): Promise<DeltaWire> {
      return request({ method: 'GET', path: `/delta?since=${encodeURIComponent(since)}`, schema: deltaSchema, protected: true });
    },
    elevate(input): Promise<ElevationResponseWire> {
      return request({
        method: 'POST',
        path: '/auth/elevate',
        body: input,
        schema: elevationResponseSchema,
        protected: true,
      });
    },
    updateClinic(input, elevationToken): Promise<ClinicWire> {
      return request({
        method: 'PATCH',
        path: '/clinic',
        body: clinicPatchSchema.parse(input),
        schema: clinicSchema,
        protected: true,
        elevationToken,
      });
    },
    updateProduct(id, input, elevationToken): Promise<ProductWire> {
      return request({
        method: 'PATCH',
        path: `/products/${encodeURIComponent(id)}`,
        body: productPatchSchema.parse(input),
        schema: productSchema,
        protected: true,
        elevationToken,
      });
    },
    lookupBarcode(code): Promise<BarcodeLookupWire> {
      return request({
        method: 'GET',
        path: `/barcode-lookup?code=${encodeURIComponent(code)}`,
        schema: barcodeLookupSchema,
        protected: true,
      });
    },
    dispatch(item): Promise<OutboxDispatchResult> {
      switch (item.kind) {
        case 'sale':
          return request({ method: 'POST', path: '/sales', body: saleSchema.parse(item.payload), schema: saleResponseSchema, protected: true });
        case 'patient':
          return request({ method: 'POST', path: '/patients', body: patientSchema.parse(item.payload), schema: patientResponseSchema, protected: true });
        case 'product':
          return request({ method: 'POST', path: '/products', body: productSchema.parse(item.payload), schema: productResponseSchema, protected: true });
        case 'stockReceive':
          return request({ method: 'POST', path: '/stock/receive', body: stockReceiveSchema.parse(item.payload), schema: stockReceiveResponseSchema, protected: true });
        case 'appointment':
          return request({ method: 'POST', path: '/appointments', body: appointmentSchema.parse(item.payload), schema: appointmentResponseSchema, protected: true });
        case 'appointmentStatus':
          return request({
            method: 'PATCH',
            path: `/appointments/${encodeURIComponent(item.appointmentId)}`,
            body: { status: appointmentStatusUpdateSchema.parse({ appointment_id: item.appointmentId, status: item.payload.status }).status },
            schema: appointmentSchema,
            protected: true,
          }).then((appointment) => ({ appointment }));
        case 'contact':
          return request({ method: 'POST', path: '/contact-log', body: contactSchema.parse(item.payload), schema: contactResponseSchema, protected: true });
        case 'salePayment':
          return request({
            method: 'POST',
            path: `/sales/${encodeURIComponent(item.saleId)}/payments`,
            body: paymentSchema.parse(item.payload),
            schema: paymentResponseSchema,
            protected: true,
          });
      }
    },
  };
}

function parseResponse<TSchema extends z.ZodType>(
  response: Response,
  payload: unknown,
  schema: TSchema,
): z.output<TSchema> {
  if (!response.ok) {
    const error = apiErrorSchema.parse(payload);
    throw new ApiHttpError(error.status, error.code, error.message);
  }

  return schema.parse(payload);
}
