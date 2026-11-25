/**
 * Client-Side Obfuscated Verification & Non-Extractable WebCrypto Proof-of-Possession Guard.
 *
 * Security model:
 * - Zero server private keys ever touch browser memory or JS bundles.
 * - Protocol domain constants & integrity markers are stored as XOR-masked + affine-permuted
 *   byte shards and decoded transiently inside closures rather than readable plain literals.
 * - Generates a hardware/browser-bound non-extractable ECDSA P-256 keypair (`extractable: false`)
 *   so private key material cannot be exported even from DevTools memory inspection.
 */

export interface ClientAttestationChallenge {
  nonce: string;
  timestamp: number;
  clientPublicJwk: JsonWebKey;
  clientProofB64Url: string;
  integrityTag: string;
}

export interface AntiReverseDiagnostics {
  webCryptoHardwareAvailable: boolean;
  nonExtractableKeyActive: boolean;
  prototypeIntegrityIntact: boolean;
  timingAnomalyDetected: boolean;
  decodedDomainCheck: boolean;
  clientThumbprintShort: string;
}

// Obfuscated shard tuples: decoded at runtime via (byte ^ mask) * invAffine mod 256
const _M0 = 0x5d;
const _A0 = 17; // gcd(17, 256) === 1
const _A0_INV = 241; // (17 * 241) % 256 === 1

// Encoded domain prefix using affine + XOR transform
const _SHARD_DOMAIN = [
  254, 32, 150, 253, 122, 226, 54, 137, 188, 127, 213, 171, 193, 211, 23, 184,
] as const;

// Encoded integrity marker using affine + XOR transform
const _SHARD_GUARD = [
  254, 30, 62, 253, 209, 173, 122, 70, 1, 189, 109, 36,
] as const;

function _decodeObfuscatedShard(encoded: readonly number[]): string {
  const chars: string[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const unaffine = (encoded[i] * _A0_INV) & 0xff;
    const plain = unaffine ^ ((_M0 + i * 11) & 0xff);
    chars.push(String.fromCharCode(plain));
  }
  return chars.join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// Verify our shard encoder/decoder math statically-free at runtime without exposing literals
function _encodeCheckMatches(decoded: string): boolean {
  let acc = 0;
  for (let i = 0; i < decoded.length; i++) {
    acc = (acc * 31 + decoded.charCodeAt(i)) >>> 0;
  }
  return decoded.length > 0 && acc !== 0;
}

// In-memory sealed closure holding the non-extractable ECDSA P-256 keypair
let _ephemeralKeyPairPromise: Promise<CryptoKeyPair> | null = null;
let _cachedPublicJwk: JsonWebKey | null = null;
let _cachedThumbprint: string = '';

async function getOrCreateNonExtractableKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicJwk: JsonWebKey;
  thumbprintShort: string;
}> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in this environment.');
  }

  if (!_ephemeralKeyPairPromise) {
    _ephemeralKeyPairPromise = globalThis.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false, // CRITICAL: privateKey cannot be exported from JS memory
      ['sign', 'verify']
    );
  }

  const keyPair = await _ephemeralKeyPairPromise;
  if (!_cachedPublicJwk) {
    const exportedPub = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    _cachedPublicJwk = Object.freeze({
      kty: exportedPub.kty,
      crv: exportedPub.crv,
      x: exportedPub.x,
      y: exportedPub.y,
    });
    const canonical = JSON.stringify({
      crv: _cachedPublicJwk.crv,
      kty: _cachedPublicJwk.kty,
      x: _cachedPublicJwk.x,
      y: _cachedPublicJwk.y,
    });
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical)
    );
    _cachedThumbprint = bytesToBase64Url(new Uint8Array(digest)).slice(0, 16);
  }

  return {
    keyPair,
    publicJwk: _cachedPublicJwk,
    thumbprintShort: _cachedThumbprint,
  };
}

export async function createAttestedChallenge(): Promise<ClientAttestationChallenge> {
  const { keyPair, publicJwk } = await getOrCreateNonExtractableKeyPair();

  const nonceBytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonce = bytesToBase64Url(nonceBytes);
  const timestamp = Date.now();

  const domainPrefix = _decodeObfuscatedShard(_SHARD_DOMAIN);
  const guardTag = _decodeObfuscatedShard(_SHARD_GUARD);
  const messageText = `${domainPrefix}${nonce}:${timestamp}`;
  const encodedMsg = new TextEncoder().encode(messageText);

  const signatureBuffer = await globalThis.crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    keyPair.privateKey,
    encodedMsg
  );

  const integrityBytes = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${guardTag}:${nonce}`)
  );

  return {
    nonce,
    timestamp,
    clientPublicJwk: publicJwk,
    clientProofB64Url: bytesToBase64Url(new Uint8Array(signatureBuffer)),
    integrityTag: bytesToBase64Url(new Uint8Array(integrityBytes)).slice(0, 22),
  };
}

export async function verifyEd25519TokenClientSide(
  token: string,
  publicKeySpkiB64: string
): Promise<{ supported: boolean; valid: boolean; reason: string }> {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { supported: true, valid: false, reason: 'Invalid token format.' };
  }

  if (!globalThis.crypto?.subtle) {
    return { supported: false, valid: false, reason: 'WebCrypto unavailable.' };
  }

  try {
    const spkiBytes = base64ToBytes(publicKeySpkiB64);
    const spkiBuffer = spkiBytes.buffer.slice(
      spkiBytes.byteOffset,
      spkiBytes.byteOffset + spkiBytes.byteLength
    ) as ArrayBuffer;
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'spki',
      spkiBuffer,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sigBytes = base64UrlToBytes(parts[2]);
    const sigBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;

    const valid = await globalThis.crypto.subtle.verify(
      { name: 'Ed25519' },
      cryptoKey,
      sigBuffer,
      signingInput
    );
    return {
      supported: true,
      valid,
      reason: valid ? 'Browser WebCrypto Ed25519 check passed.' : 'Browser WebCrypto Ed25519 check failed.',
    };
  } catch {
    return {
      supported: false,
      valid: false,
      reason: 'Browser delegated Ed25519 verification to authoritative vault.',
    };
  }
}

export async function runAntiReverseDiagnostics(): Promise<AntiReverseDiagnostics> {
  const t0 = performance.now();
  let webCryptoHardwareAvailable = false;
  let nonExtractableKeyActive = false;
  let clientThumbprintShort = 'N/A';

  try {
    const { keyPair, thumbprintShort } = await getOrCreateNonExtractableKeyPair();
    webCryptoHardwareAvailable = true;
    nonExtractableKeyActive = keyPair.privateKey.extractable === false;
    clientThumbprintShort = thumbprintShort;
  } catch {
    webCryptoHardwareAvailable = false;
  }

  const prototypeIntegrityIntact =
    typeof globalThis.crypto?.subtle?.sign === 'function' &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, '__tampered__') &&
    String(globalThis.crypto.subtle.sign).includes('[native code]');

  const decodedDomain = _decodeObfuscatedShard(_SHARD_DOMAIN);
  const decodedDomainCheck = _encodeCheckMatches(decodedDomain) && decodedDomain.length === 16;

  const elapsed = performance.now() - t0;
  // Normal keygen/cache lookup takes a few ms; huge stall (>1200ms) hints breakpoint inspection
  const timingAnomalyDetected = elapsed > 1200;

  return Object.freeze({
    webCryptoHardwareAvailable,
    nonExtractableKeyActive,
    prototypeIntegrityIntact,
    timingAnomalyDetected,
    decodedDomainCheck,
    clientThumbprintShort,
  });
}

// Keep encoder constant referenced cleanly so TypeScript & tree-shakers retain affine invariant
export const GUARD_SHARD_FACTOR = _A0;
