import { afterEach, expect, test, vi } from 'vitest';
import { readApiBaseUrl } from '@/data/runtimeConfig';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('normalizes an HTTP(S) API origin', () => {
  expect(readApiBaseUrl('http://127.0.0.1:4010/')).toBe('http://127.0.0.1:4010');
  expect(readApiBaseUrl('https://api.eden.example')).toBe('https://api.eden.example');
});

test('reads the public build-time environment value when no argument is passed', () => {
  vi.stubEnv('NEXT_PUBLIC_EDEN_API_BASE_URL', 'http://127.0.0.1:4010');

  expect(readApiBaseUrl()).toBe('http://127.0.0.1:4010');
});

test('rejects missing and unsafe public API origins', () => {
  vi.stubEnv('NEXT_PUBLIC_EDEN_API_BASE_URL', '');
  expect(() => readApiBaseUrl()).toThrow('NEXT_PUBLIC_EDEN_API_BASE_URL');
  expect(() => readApiBaseUrl('ftp://example.test')).toThrow('HTTP');
  expect(() => readApiBaseUrl('https://user:pass@example.test')).toThrow('credentials');
  expect(() => readApiBaseUrl('https://example.test/api?x=1')).toThrow('query');
  expect(() => readApiBaseUrl('https://example.test/#fragment')).toThrow('hash');
});
