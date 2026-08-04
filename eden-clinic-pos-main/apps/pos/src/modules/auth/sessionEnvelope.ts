import { z } from '@/data/zod';

const envelopeVersion = 1;
const kdfName = 'PBKDF2-HMAC-SHA-256';
const kdfIterations = 600_000;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const base64String = z.string().min(4).regex(base64Pattern);
const storedSessionEnvelopeSchema = z.object({
  version: z.literal(envelopeVersion),
  kdf: z.literal(kdfName),
  iterations: z.literal(kdfIterations),
  saltBase64: base64String,
  ivBase64: base64String,
  ciphertextBase64: base64String,
}).strict();

const sessionSecretSchema = z.object({
  identity: z.object({
    staffId: z.string(),
    name: z.string(),
    role: z.enum(['admin', 'staff']),
    validUntil: z.iso.datetime({ offset: true }),
  }).strict(),
  credential: z.object({
    refreshToken: z.string(),
    refreshedAt: z.iso.datetime({ offset: true }),
  }).strict(),
}).strict();

export type StoredSessionEnvelope = z.infer<typeof storedSessionEnvelopeSchema>;
export type SessionIdentity = z.infer<typeof sessionSecretSchema>['identity'];
export type SessionSecret = z.infer<typeof sessionSecretSchema>;

export type SessionCrypto = {
  randomBytes(length: number): Uint8Array;
  deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>;
  encrypt(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
};

export type EncryptSessionSecretInput = {
  secret: SessionSecret;
  crypto: SessionCrypto;
  pin?: string;
  key?: CryptoKey;
  salt?: Uint8Array;
};

export type DecryptSessionSecretInput = {
  envelope: unknown;
  pin: string;
  crypto: SessionCrypto;
};

export class InvalidSessionEnvelopeError extends Error {
  constructor(message = 'The stored session envelope is invalid.') {
    super(message);
    this.name = 'InvalidSessionEnvelopeError';
  }
}

export class WrongPinError extends Error {
  constructor() {
    super('The PIN could not unlock this session.');
    this.name = 'WrongPinError';
  }
}

export async function encryptSessionSecret(input: EncryptSessionSecretInput): Promise<{
  envelope: StoredSessionEnvelope;
  key: CryptoKey;
  salt: Uint8Array;
  iv: Uint8Array;
}> {
  const salt = input.salt ?? input.crypto.randomBytes(16);
  if (salt.length !== 16) {
    throw new InvalidSessionEnvelopeError('Session-envelope salt must be 16 bytes.');
  }

  const key = input.key ?? await deriveKeyFromPin(input.pin, salt, input.crypto);
  const iv = input.crypto.randomBytes(12);
  if (iv.length !== 12) {
    throw new InvalidSessionEnvelopeError('Session-envelope IV must be 12 bytes.');
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(sessionSecretSchema.parse(input.secret)));
  const ciphertext = await input.crypto.encrypt(key, iv, plaintext);
  if (ciphertext.length < 17) {
    throw new InvalidSessionEnvelopeError('Session-envelope ciphertext is too short.');
  }

  return {
    envelope: {
      version: envelopeVersion,
      kdf: kdfName,
      iterations: kdfIterations,
      saltBase64: encodeBase64(salt),
      ivBase64: encodeBase64(iv),
      ciphertextBase64: encodeBase64(ciphertext),
    },
    key,
    salt,
    iv,
  };
}

export async function decryptSessionSecret(input: DecryptSessionSecretInput): Promise<{
  secret: SessionSecret;
  key: CryptoKey;
  salt: Uint8Array;
}> {
  const envelope = parseStoredEnvelope(input.envelope);
  const salt = decodeBase64(envelope.saltBase64, 'salt');
  const iv = decodeBase64(envelope.ivBase64, 'IV');
  const ciphertext = decodeBase64(envelope.ciphertextBase64, 'ciphertext');

  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new InvalidSessionEnvelopeError('Session-envelope binary shape is invalid.');
  }

  const key = await input.crypto.deriveKey(input.pin, salt, envelope.iterations);
  let plaintext: Uint8Array;
  try {
    plaintext = await input.crypto.decrypt(key, iv, ciphertext);
  } catch {
    throw new WrongPinError();
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    return { secret: sessionSecretSchema.parse(parsed), key, salt };
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new InvalidSessionEnvelopeError();
    }
    throw error;
  }
}

export function createWebCryptoSessionCrypto(): SessionCrypto {
  const webCrypto = globalThis.crypto;

  if (webCrypto === undefined || webCrypto.subtle === undefined) {
    throw new Error('Web Crypto is unavailable.');
  }

  return {
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      webCrypto.getRandomValues(bytes);
      return bytes;
    },
    async deriveKey(pin, salt, iterations) {
      const baseKey = await webCrypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveKey'],
      );
      return webCrypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    },
    async encrypt(key, iv, plaintext) {
      return new Uint8Array(await webCrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(plaintext),
      ));
    },
    async decrypt(key, iv, ciphertext) {
      return new Uint8Array(await webCrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext),
      ));
    },
  };
}

function parseStoredEnvelope(value: unknown): StoredSessionEnvelope {
  try {
    return storedSessionEnvelopeSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidSessionEnvelopeError();
    }
    throw error;
  }
}

async function deriveKeyFromPin(pin: string | undefined, salt: Uint8Array, crypto: SessionCrypto): Promise<CryptoKey> {
  if (pin === undefined) {
    throw new InvalidSessionEnvelopeError('A PIN is required to derive a session key.');
  }

  return crypto.deriveKey(pin, salt, kdfIterations);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string, field: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new InvalidSessionEnvelopeError(`Session-envelope ${field} is not valid base64.`);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
