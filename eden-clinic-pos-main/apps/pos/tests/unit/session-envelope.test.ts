import { expect, test, vi } from 'vitest';
import {
  createWebCryptoSessionCrypto,
  decryptSessionSecret,
  encryptSessionSecret,
  InvalidSessionEnvelopeError,
  WrongPinError,
  type SessionCrypto,
  type SessionSecret,
} from '@/modules/auth/sessionEnvelope';

const secret: SessionSecret = {
  identity: {
    staffId: 's1',
    name: 'Dr. Hkawn Mai',
    role: 'admin',
    validUntil: '2026-10-29T12:00:00.000Z',
  },
  credential: {
    refreshToken: 'ref_secret-token',
    refreshedAt: '2026-07-31T12:00:00.000Z',
  },
};

function createDeterministicCrypto(): SessionCrypto & { decrypt: ReturnType<typeof vi.fn> } {
  let randomOffset = 0;
  const decrypt = vi.fn(async (_key: CryptoKey, _iv: Uint8Array, ciphertext: Uint8Array) => {
    return Uint8Array.from(ciphertext, (byte) => byte ^ 0xff);
  });

  return {
    randomBytes(length) {
      const offset = randomOffset;
      randomOffset += length;
      return Uint8Array.from({ length }, (_, index) => (offset + index + 1) % 256);
    },
    async deriveKey() {
      return {} as CryptoKey;
    },
    async encrypt(_key, _iv, plaintext) {
      return Uint8Array.from(plaintext, (byte) => byte ^ 0xff);
    },
    decrypt,
  };
}

test('creates a versioned opaque envelope with the approved KDF parameters', async () => {
  const crypto = createDeterministicCrypto();
  const encrypted = await encryptSessionSecret({ pin: '1234', secret, crypto });
  const serialized = JSON.stringify(encrypted.envelope);

  expect(encrypted.envelope).toMatchObject({
    version: 1,
    kdf: 'PBKDF2-HMAC-SHA-256',
    iterations: 600_000,
  });
  expect(encrypted.salt).toHaveLength(16);
  expect(encrypted.iv).toHaveLength(12);
  expect(serialized).not.toContain('1234');
  expect(serialized).not.toContain('ref_secret-token');
  expect(crypto.decrypt).not.toHaveBeenCalled();
});

test('round-trips a correct PIN and rejects a wrong PIN with Web Crypto', async () => {
  const crypto = createWebCryptoSessionCrypto();
  const encrypted = await encryptSessionSecret({ pin: '1234', secret, crypto });

  await expect(decryptSessionSecret({ envelope: encrypted.envelope, pin: '1234', crypto })).resolves.toMatchObject({ secret });
  await expect(decryptSessionSecret({ envelope: encrypted.envelope, pin: '0000', crypto })).rejects.toBeInstanceOf(WrongPinError);
});

test('rejects corrupt and future envelopes before attempting decryption', async () => {
  const crypto = createDeterministicCrypto();
  const encrypted = await encryptSessionSecret({ pin: '1234', secret, crypto });
  const invalid = { ...encrypted.envelope, version: 2 };

  await expect(decryptSessionSecret({ envelope: invalid, pin: '1234', crypto })).rejects.toBeInstanceOf(InvalidSessionEnvelopeError);
  expect(crypto.decrypt).not.toHaveBeenCalled();

  await expect(decryptSessionSecret({
    envelope: { ...encrypted.envelope, saltBase64: 'not valid' },
    pin: '1234',
    crypto,
  })).rejects.toBeInstanceOf(InvalidSessionEnvelopeError);
  expect(crypto.decrypt).not.toHaveBeenCalled();
});

test('uses a fresh IV when rotating an encrypted credential', async () => {
  const crypto = createDeterministicCrypto();
  const first = await encryptSessionSecret({ pin: '1234', secret, crypto });
  const second = await encryptSessionSecret({
    key: first.key,
    salt: first.salt,
    secret: { ...secret, credential: { ...secret.credential, refreshToken: 'ref_rotated-token' } },
    crypto,
  });

  expect(second.envelope.ivBase64).not.toBe(first.envelope.ivBase64);
  expect(second.envelope.ciphertextBase64).not.toBe(first.envelope.ciphertextBase64);
  await expect(decryptSessionSecret({ envelope: second.envelope, pin: '1234', crypto })).resolves.toMatchObject({
    secret: { identity: secret.identity, credential: { refreshToken: 'ref_rotated-token' } },
  });
});
