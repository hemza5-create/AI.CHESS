/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import crypto from 'node:crypto';

export type KeyEpochStatus = 'active' | 'grace' | 'retired';

export interface PublicKeyMetadata {
  kid: string;
  epoch: number;
  algorithm: 'Ed25519';
  kdf: 'HKDF-SHA512';
  sealCipher: 'AES-256-GCM+XOR-SPLIT';
  status: KeyEpochStatus;
  publicKeySpkiB64: string;
  fingerprintSha256: string;
  issuedAt: number;
  expiresAt: number;
  graceUntil: number;
  prevKid: string | null;
  rotationProof: string | null;
  rotationReason: string;
}

interface SealedEpochRecord {
  meta: PublicKeyMetadata;
  sealedPrivateKeyCiphertext: Buffer;
  sealIv: Buffer;
  sealAuthTag: Buffer;
  epochSalt: Buffer;
  hmacKeySealedCiphertext: Buffer;
  hmacSealIv: Buffer;
  hmacSealAuthTag: Buffer;
}

export interface RotationPolicy {
  autoRotateEnabled: boolean;
  rotationIntervalMs: number;
  graceWindowMs: number;
}

export interface TokenVerificationResult {
  valid: boolean;
  reason: string;
  epochStatus?: KeyEpochStatus;
  header?: {
    alg: string;
    typ: string;
    kid: string;
  };
  payload?: {
    iss: string;
    sub: string;
    scope: string;
    epoch: number;
    iat: number;
    exp: number;
    jti: string;
    cnf?: {
      jkt: string;
    };
  };
}

interface ClaimedAdminCredential {
  saltHex: string;
  hashHex: string;
}

interface AdminSessionRecord {
  jti: string;
  issuedAt: number;
  expiresAt: number;
}

const MIN_ROTATION_INTERVAL_MS = 60_000; // 1 minute
const MAX_ROTATION_INTERVAL_MS = 86_400_000; // 24 hours
const MIN_GRACE_WINDOW_MS = 30_000; // 30 seconds
const MAX_GRACE_WINDOW_MS = 3_600_000; // 1 hour
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_REPLAY_CACHE_SIZE = 2000;
const MAX_AUDIT_HISTORY = 24;

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function xorBuffers(a: Buffer, mask: Buffer): Buffer {
  const out = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ mask[i % mask.length];
  }
  return out;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeJwkThumbprint(jwk: { kty: string; crv: string; x: string; y: string }): string {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

interface AdminAuthAttemptRecord {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

export const SERVER_AUTHOR_FINGERPRINT = Object.freeze({
  developer: 'Hemza Harigui',
  fingerprintId: 'HH-CVSU-2026',
  project: 'ChessVision UCI',
  year: 2026,
} as const);

const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;
const AUTH_MAX_FAILURES = 8;
const AUTH_LOCKOUT_MS = 5 * 60 * 1000;

export class CryptoKeyVault {
  // Root secret: derived from process.env or volatile CSPRNG bytes in memory only
  private readonly masterRootSecret: Buffer;
  // Runtime volatile memory mask XOR'd against key bytes before AES-256-GCM sealing
  private readonly volatileMemoryMask: Buffer;

  private policy: RotationPolicy;
  private epochCounter = 0;
  private activeEpoch: SealedEpochRecord | null = null;
  private graceEpochs: Map<string, SealedEpochRecord> = new Map();
  private auditHistory: PublicKeyMetadata[] = [];

  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private usedNonces: Map<string, number> = new Map();
  private claimedAdmin: ClaimedAdminCredential | null = null;
  private adminSessions: Map<string, AdminSessionRecord> = new Map();
  private authAttempts: Map<string, AdminAuthAttemptRecord> = new Map();

  constructor() {
    const envMaster = process.env.KEY_VAULT_MASTER_SECRET?.trim();
    this.masterRootSecret = envMaster
      ? crypto.createHash('sha512').update(envMaster, 'utf8').digest()
      : crypto.randomBytes(64);
    this.volatileMemoryMask = crypto.randomBytes(64);

    const envRotationSec = Number(process.env.KEY_ROTATION_INTERVAL_SECONDS ?? 900);
    const clampedInterval = Number.isFinite(envRotationSec)
      ? Math.max(
          MIN_ROTATION_INTERVAL_MS,
          Math.min(MAX_ROTATION_INTERVAL_MS, Math.round(envRotationSec * 1000))
        )
      : 900_000;

    this.policy = {
      autoRotateEnabled: true,
      rotationIntervalMs: clampedInterval,
      graceWindowMs: 300_000, // 5 minutes overlap during rollover
    };

    // Bootstrap initial unforgeable Ed25519 epoch
    this.rotateKeys('initial-bootstrap');
    this.scheduleAutoRotation();
  }

  private deriveSealKey(salt: Buffer, infoLabel: string): Buffer {
    const derived = crypto.hkdfSync(
      'sha512',
      this.masterRootSecret,
      salt,
      Buffer.from(infoLabel, 'utf8'),
      32
    );
    return Buffer.from(derived);
  }

  private sealSecretMaterial(
    plainBytes: Buffer,
    salt: Buffer,
    infoLabel: string
  ): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const sealKey = this.deriveSealKey(salt, infoLabel);
    const masked = xorBuffers(plainBytes, this.volatileMemoryMask);
    const iv = crypto.randomBytes(12);
    try {
      const cipher = crypto.createCipheriv('aes-256-gcm', sealKey, iv);
      const ciphertext = Buffer.concat([cipher.update(masked), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return { ciphertext, iv, authTag };
    } finally {
      sealKey.fill(0);
      masked.fill(0);
    }
  }

  private unsealSecretMaterial(
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer,
    salt: Buffer,
    infoLabel: string
  ): Buffer {
    const sealKey = this.deriveSealKey(salt, infoLabel);
    let masked = Buffer.alloc(0);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey, iv);
      decipher.setAuthTag(authTag);
      masked = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return xorBuffers(masked, this.volatileMemoryMask);
    } finally {
      sealKey.fill(0);
      masked.fill(0);
    }
  }

  private wipeRecordBuffers(record: SealedEpochRecord): void {
    record.sealedPrivateKeyCiphertext.fill(0);
    record.sealIv.fill(0);
    record.sealAuthTag.fill(0);
    record.epochSalt.fill(0);
    record.hmacKeySealedCiphertext.fill(0);
    record.hmacSealIv.fill(0);
    record.hmacSealAuthTag.fill(0);
  }

  private signWithEpoch(record: SealedEpochRecord, message: Buffer): Buffer {
    const derBytes = this.unsealSecretMaterial(
      record.sealedPrivateKeyCiphertext,
      record.sealIv,
      record.sealAuthTag,
      record.epochSalt,
      `ed25519-private-seal:${record.meta.kid}`
    );
    try {
      const privateKey = crypto.createPrivateKey({
        key: derBytes,
        format: 'der',
        type: 'pkcs8',
      });
      return crypto.sign(null, message, privateKey);
    } finally {
      derBytes.fill(0);
    }
  }

  private pruneExpiredGraceEpochs(now = Date.now()): void {
    for (const [kid, record] of this.graceEpochs.entries()) {
      if (now >= record.meta.graceUntil) {
        record.meta.status = 'retired';
        this.wipeRecordBuffers(record);
        this.graceEpochs.delete(kid);
        const hist = this.auditHistory.find((item) => item.kid === kid);
        if (hist) hist.status = 'retired';
      }
    }

    // Prune used anti-replay nonces
    for (const [nonce, expiry] of this.usedNonces.entries()) {
      if (now >= expiry) {
        this.usedNonces.delete(nonce);
      }
    }
    if (this.usedNonces.size > MAX_REPLAY_CACHE_SIZE) {
      const overflow = this.usedNonces.size - MAX_REPLAY_CACHE_SIZE;
      let removed = 0;
      for (const k of this.usedNonces.keys()) {
        this.usedNonces.delete(k);
        removed++;
        if (removed >= overflow) break;
      }
    }

    // Prune expired admin sessions
    for (const [sid, sess] of this.adminSessions.entries()) {
      if (now >= sess.expiresAt) {
        this.adminSessions.delete(sid);
      }
    }
  }

  private scheduleAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (!this.policy.autoRotateEnabled) return;

    this.rotationTimer = setInterval(() => {
      try {
        this.rotateKeys('scheduled-periodic-rotation');
      } catch (err) {
        console.error('[CryptoKeyVault] Scheduled rotation error:', err);
      }
    }, this.policy.rotationIntervalMs);

    if (typeof this.rotationTimer.unref === 'function') {
      this.rotationTimer.unref();
    }
  }

  public rotateKeys(reason = 'manual-programmatic-rotation'): PublicKeyMetadata {
    const now = Date.now();
    this.pruneExpiredGraceEpochs(now);

    this.epochCounter += 1;
    const epochNum = this.epochCounter;
    const randomTag = crypto.randomBytes(6).toString('hex');
    const kid = `cvk-e${epochNum}-${randomTag}`;

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const pkcs8Der = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
    const hmacSecret = crypto.randomBytes(64);
    const epochSalt = crypto.randomBytes(32);

    const publicKeySpkiB64 = spkiDer.toString('base64');
    const fingerprintSha256 = sha256Hex(spkiDer);
    const issuedAt = now;
    const expiresAt = now + this.policy.rotationIntervalMs;
    const graceUntil = expiresAt + this.policy.graceWindowMs;

    const prevRecord = this.activeEpoch;
    const prevKid = prevRecord ? prevRecord.meta.kid : null;
    let rotationProof: string | null = null;

    if (prevRecord) {
      const lineageStatement = Buffer.from(
        `ROTATE|${prevRecord.meta.kid}->${kid}|${epochNum}|${fingerprintSha256}|${issuedAt}`,
        'utf8'
      );
      rotationProof = toBase64Url(this.signWithEpoch(prevRecord, lineageStatement));
      prevRecord.meta.status = 'grace';
      prevRecord.meta.graceUntil = now + this.policy.graceWindowMs;
      this.graceEpochs.set(prevRecord.meta.kid, prevRecord);
      const prevHist = this.auditHistory.find((h) => h.kid === prevRecord.meta.kid);
      if (prevHist) {
        prevHist.status = 'grace';
        prevHist.graceUntil = prevRecord.meta.graceUntil;
      }
    }

    try {
      const sealedPriv = this.sealSecretMaterial(
        pkcs8Der,
        epochSalt,
        `ed25519-private-seal:${kid}`
      );
      const sealedHmac = this.sealSecretMaterial(
        hmacSecret,
        epochSalt,
        `hmac-sha512-seal:${kid}`
      );

      const meta: PublicKeyMetadata = {
        kid,
        epoch: epochNum,
        algorithm: 'Ed25519',
        kdf: 'HKDF-SHA512',
        sealCipher: 'AES-256-GCM+XOR-SPLIT',
        status: 'active',
        publicKeySpkiB64,
        fingerprintSha256,
        issuedAt,
        expiresAt,
        graceUntil,
        prevKid,
        rotationProof,
        rotationReason: reason.slice(0, 64),
      };

      const nextRecord: SealedEpochRecord = {
        meta,
        sealedPrivateKeyCiphertext: sealedPriv.ciphertext,
        sealIv: sealedPriv.iv,
        sealAuthTag: sealedPriv.authTag,
        epochSalt,
        hmacKeySealedCiphertext: sealedHmac.ciphertext,
        hmacSealIv: sealedHmac.iv,
        hmacSealAuthTag: sealedHmac.authTag,
      };

      this.activeEpoch = nextRecord;
      this.auditHistory.unshift({ ...meta });
      if (this.auditHistory.length > MAX_AUDIT_HISTORY) {
        this.auditHistory = this.auditHistory.slice(0, MAX_AUDIT_HISTORY);
      }

      return { ...meta };
    } finally {
      pkcs8Der.fill(0);
      hmacSecret.fill(0);
    }
  }

  public updatePolicy(patch: {
    autoRotateEnabled?: boolean;
    rotationIntervalSeconds?: number;
    graceWindowSeconds?: number;
  }): RotationPolicy {
    if (typeof patch.autoRotateEnabled === 'boolean') {
      this.policy.autoRotateEnabled = patch.autoRotateEnabled;
    }
    if (
      typeof patch.rotationIntervalSeconds === 'number' &&
      Number.isFinite(patch.rotationIntervalSeconds)
    ) {
      this.policy.rotationIntervalMs = Math.max(
        MIN_ROTATION_INTERVAL_MS,
        Math.min(MAX_ROTATION_INTERVAL_MS, Math.round(patch.rotationIntervalSeconds * 1000))
      );
    }
    if (
      typeof patch.graceWindowSeconds === 'number' &&
      Number.isFinite(patch.graceWindowSeconds)
    ) {
      this.policy.graceWindowMs = Math.max(
        MIN_GRACE_WINDOW_MS,
        Math.min(MAX_GRACE_WINDOW_MS, Math.round(patch.graceWindowSeconds * 1000))
      );
    }

    if (this.activeEpoch) {
      const baseIssued = this.activeEpoch.meta.issuedAt;
      this.activeEpoch.meta.expiresAt = baseIssued + this.policy.rotationIntervalMs;
      this.activeEpoch.meta.graceUntil =
        this.activeEpoch.meta.expiresAt + this.policy.graceWindowMs;
      const hist = this.auditHistory.find((h) => h.kid === this.activeEpoch?.meta.kid);
      if (hist) {
        hist.expiresAt = this.activeEpoch.meta.expiresAt;
        hist.graceUntil = this.activeEpoch.meta.graceUntil;
      }
    }

    this.scheduleAutoRotation();
    return { ...this.policy };
  }

  public getPublicKeyBundle() {
    this.pruneExpiredGraceEpochs();
    const active = this.activeEpoch ? { ...this.activeEpoch.meta } : null;
    const grace = Array.from(this.graceEpochs.values()).map((r) => ({ ...r.meta }));
    return {
      activeKid: active?.kid ?? null,
      policy: { ...this.policy },
      activeKey: active,
      graceKeys: grace,
      auditHistory: this.auditHistory.map((item) => ({ ...item })),
      serverTime: Date.now(),
    };
  }

  public consumeAntiReplayNonce(nonce: string, timestampMs: number): { ok: boolean; error?: string } {
    const now = Date.now();
    this.pruneExpiredGraceEpochs(now);

    if (!nonce || nonce.length < 12 || nonce.length > 128) {
      return { ok: false, error: 'Invalid cryptographic nonce format.' };
    }
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 120_000) {
      return { ok: false, error: 'Request timestamp outside allowed ±120s window.' };
    }
    if (this.usedNonces.has(nonce)) {
      return { ok: false, error: 'Replay attack blocked: nonce already consumed.' };
    }
    this.usedNonces.set(nonce, now + 180_000);
    return { ok: true };
  }

  public verifyClientPopProof(params: {
    clientPublicJwk: { kty?: string; crv?: string; x?: string; y?: string };
    clientProofB64Url: string;
    nonce: string;
    timestamp: number;
  }): { ok: boolean; thumbprint?: string; error?: string } {
    const { clientPublicJwk, clientProofB64Url, nonce, timestamp } = params;
    if (
      !clientPublicJwk ||
      clientPublicJwk.kty !== 'EC' ||
      clientPublicJwk.crv !== 'P-256' ||
      typeof clientPublicJwk.x !== 'string' ||
      typeof clientPublicJwk.y !== 'string'
    ) {
      return { ok: false, error: 'Invalid client ECDSA P-256 public JWK.' };
    }

    try {
      const pubKey = crypto.createPublicKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: clientPublicJwk.x,
          y: clientPublicJwk.y,
        },
        format: 'jwk',
      });
      const challengePayload = Buffer.from(`CHESSVISION-POP:${nonce}:${timestamp}`, 'utf8');
      const sigBuf = fromBase64Url(clientProofB64Url);
      const valid = crypto.verify(
        'sha256',
        challengePayload,
        { key: pubKey, dsaEncoding: 'ieee-p1363' },
        sigBuf
      );
      if (!valid) {
        return { ok: false, error: 'Client non-extractable PoP signature failed verification.' };
      }
      const thumbprint = computeJwkThumbprint({
        kty: 'EC',
        crv: 'P-256',
        x: clientPublicJwk.x,
        y: clientPublicJwk.y,
      });
      return { ok: true, thumbprint };
    } catch {
      return { ok: false, error: 'Malformed client Proof-of-Possession signature.' };
    }
  }

  public issueSignedToken(options: {
    subject: string;
    scope: string;
    ttlSeconds?: number;
    clientThumbprint?: string;
  }): { token: string; kid: string; epoch: number; expiresAt: number; hmacDigest: string } {
    this.pruneExpiredGraceEpochs();
    if (!this.activeEpoch) {
      this.rotateKeys('emergency-recovery');
    }
    const active = this.activeEpoch!;
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = Math.max(30, Math.min(3600, Math.round(options.ttlSeconds ?? 300)));

    const header = {
      alg: 'EdDSA',
      typ: 'CVT+JWT',
      kid: active.meta.kid,
    };

    const payload: {
      iss: string;
      sub: string;
      scope: string;
      epoch: number;
      iat: number;
      exp: number;
      jti: string;
      cnf?: { jkt: string };
    } = {
      iss: 'chessvision-sealed-vault',
      sub: options.subject.slice(0, 64),
      scope: options.scope.slice(0, 64),
      epoch: active.meta.epoch,
      iat: nowSec,
      exp: nowSec + ttl,
      jti: crypto.randomBytes(16).toString('base64url'),
    };
    if (options.clientThumbprint) {
      payload.cnf = { jkt: options.clientThumbprint };
    }

    const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
    const signature = this.signWithEpoch(active, Buffer.from(signingInput, 'utf8'));
    const token = `${signingInput}.${toBase64Url(signature)}`;

    // Derive sealed per-epoch HMAC-SHA512 tag to bind transport integrity
    const hmacKey = this.unsealSecretMaterial(
      active.hmacKeySealedCiphertext,
      active.hmacSealIv,
      active.hmacSealAuthTag,
      active.epochSalt,
      `hmac-sha512-seal:${active.meta.kid}`
    );
    let hmacDigest = '';
    try {
      hmacDigest = crypto.createHmac('sha512', hmacKey).update(token, 'utf8').digest('base64url');
    } finally {
      hmacKey.fill(0);
    }

    return {
      token,
      kid: active.meta.kid,
      epoch: active.meta.epoch,
      expiresAt: payload.exp * 1000,
      hmacDigest,
    };
  }

  public verifySignedToken(token: string): TokenVerificationResult {
    this.pruneExpiredGraceEpochs();
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'Token is missing.' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Invalid token structure (expected 3 JWS segments).' };
    }

    const [hB64, pB64, sB64] = parts;
    let header: TokenVerificationResult['header'];
    let payload: TokenVerificationResult['payload'];

    try {
      header = JSON.parse(fromBase64Url(hB64).toString('utf8')) as TokenVerificationResult['header'];
      payload = JSON.parse(fromBase64Url(pB64).toString('utf8')) as TokenVerificationResult['payload'];
    } catch {
      return { valid: false, reason: 'Malformed Base64URL header or payload.' };
    }

    if (!header || header.alg !== 'EdDSA' || typeof header.kid !== 'string') {
      return { valid: false, reason: 'Unsupported algorithm or missing key ID (kid).' };
    }

    let targetRecord: SealedEpochRecord | undefined;
    if (this.activeEpoch && this.activeEpoch.meta.kid === header.kid) {
      targetRecord = this.activeEpoch;
    } else {
      targetRecord = this.graceEpochs.get(header.kid);
    }

    if (!targetRecord) {
      return {
        valid: false,
        reason: 'Key epoch retired, unknown, or revoked — signature cannot be trusted.',
        header,
      };
    }

    try {
      const spkiBuf = Buffer.from(targetRecord.meta.publicKeySpkiB64, 'base64');
      const pubKey = crypto.createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
      const sigBuf = fromBase64Url(sB64);
      const signingInput = Buffer.from(`${hB64}.${pB64}`, 'utf8');

      const sigValid = crypto.verify(null, signingInput, pubKey, sigBuf);
      if (!sigValid) {
        return {
          valid: false,
          reason: 'Ed25519 signature verification FAILED — token forged or tampered!',
          epochStatus: targetRecord.meta.status,
          header,
          payload,
        };
      }
    } catch {
      return { valid: false, reason: 'Signature decoding error.' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || nowSec > payload.exp) {
      return {
        valid: false,
        reason: 'Token signature is valid, but token has expired.',
        epochStatus: targetRecord.meta.status,
        header,
        payload,
      };
    }

    return {
      valid: true,
      reason: `Verified authentic Ed25519 signature under ${targetRecord.meta.status.toUpperCase()} key ${targetRecord.meta.kid}.`,
      epochStatus: targetRecord.meta.status,
      header,
      payload,
    };
  }

  // ==================== Admin Passcode Auth (env override or one-time claim) ====================
  private getEnvPasscode(): string {
    return (process.env.KEY_ADMIN_PASSCODE ?? '').trim();
  }

  public getAuthStatus(bearerToken?: string): {
    configuredViaEnv: boolean;
    claimed: boolean;
    authenticated: boolean;
  } {
    this.pruneExpiredGraceEpochs();
    const envPass = this.getEnvPasscode();
    return {
      configuredViaEnv: envPass.length > 0,
      claimed: this.claimedAdmin !== null,
      authenticated: bearerToken ? this.verifyAdminSession(bearerToken) : false,
    };
  }

  private checkAuthRateLimit(clientKey: string): { allowed: boolean; retryAfterSec?: number } {
    const key = clientKey || 'default';
    const now = Date.now();
    const record = this.authAttempts.get(key);
    if (!record) return { allowed: true };
    if (record.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((record.lockedUntil - now) / 1000)),
      };
    }
    if (now - record.windowStart > AUTH_RATE_WINDOW_MS) {
      this.authAttempts.delete(key);
    }
    return { allowed: true };
  }

  private recordAuthFailure(clientKey: string): void {
    const key = clientKey || 'default';
    const now = Date.now();
    const existing = this.authAttempts.get(key);
    if (!existing || now - existing.windowStart > AUTH_RATE_WINDOW_MS) {
      this.authAttempts.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
      return;
    }
    existing.failures += 1;
    if (existing.failures >= AUTH_MAX_FAILURES) {
      existing.lockedUntil = now + AUTH_LOCKOUT_MS;
    }
  }

  private clearAuthFailures(clientKey: string): void {
    this.authAttempts.delete(clientKey || 'default');
  }

  public claimAdminPasscode(
    passcode: string,
    clientKey = 'default'
  ): { ok: boolean; error?: string; token?: string; rateLimited?: boolean } {
    const rate = this.checkAuthRateLimit(clientKey);
    if (!rate.allowed) {
      return {
        ok: false,
        rateLimited: true,
        error: `Too many authentication attempts. Try again in ${rate.retryAfterSec}s.`,
      };
    }
    if (this.getEnvPasscode().length > 0) {
      return {
        ok: false,
        error: 'Admin passcode is already configured via server environment secrets.',
      };
    }
    if (this.claimedAdmin !== null) {
      return {
        ok: false,
        error: 'First-run admin passcode has already been claimed.',
      };
    }
    const clean = typeof passcode === 'string' ? passcode.trim() : '';
    if (clean.length < 8 || clean.length > 128) {
      this.recordAuthFailure(clientKey);
      return { ok: false, error: 'Passcode must be between 8 and 128 characters.' };
    }

    const saltHex = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(clean, saltHex, 64);
    this.claimedAdmin = {
      saltHex,
      hashHex: derived.toString('hex'),
    };
    this.clearAuthFailures(clientKey);
    const token = this.createAdminSession();
    return { ok: true, token };
  }

  public loginWithPasscode(
    passcode: string,
    clientKey = 'default'
  ): { ok: boolean; error?: string; token?: string; rateLimited?: boolean } {
    const rate = this.checkAuthRateLimit(clientKey);
    if (!rate.allowed) {
      return {
        ok: false,
        rateLimited: true,
        error: `Too many failed login attempts. Try again in ${rate.retryAfterSec}s.`,
      };
    }
    const clean = typeof passcode === 'string' ? passcode.trim() : '';
    if (!clean) {
      this.recordAuthFailure(clientKey);
      return { ok: false, error: 'Passcode is required.' };
    }

    const envPass = this.getEnvPasscode();
    if (envPass.length > 0) {
      const a = crypto.createHash('sha256').update(clean, 'utf8').digest();
      const b = crypto.createHash('sha256').update(envPass, 'utf8').digest();
      if (!crypto.timingSafeEqual(a, b)) {
        this.recordAuthFailure(clientKey);
        return { ok: false, error: 'Invalid admin passcode.' };
      }
      this.clearAuthFailures(clientKey);
      return { ok: true, token: this.createAdminSession() };
    }

    if (!this.claimedAdmin) {
      return {
        ok: false,
        error: 'No admin passcode configured yet. Claim the first-run passcode first.',
      };
    }

    const derived = crypto.scryptSync(clean, this.claimedAdmin.saltHex, 64);
    const stored = Buffer.from(this.claimedAdmin.hashHex, 'hex');
    if (derived.length !== stored.length || !crypto.timingSafeEqual(derived, stored)) {
      this.recordAuthFailure(clientKey);
      return { ok: false, error: 'Invalid admin passcode.' };
    }
    this.clearAuthFailures(clientKey);
    return { ok: true, token: this.createAdminSession() };
  }

  public getSignedOwnershipAttestation(): {
    fingerprint: typeof SERVER_AUTHOR_FINGERPRINT;
    digestSha256: string;
    signatureToken: string;
    activeKid: string;
    publicKeySpkiB64: string;
    epoch: number;
    serverTime: number;
  } {
    if (!this.activeEpoch) {
      this.rotateKeys('ownership-attestation-init');
    }
    const canonical = JSON.stringify(SERVER_AUTHOR_FINGERPRINT);
    const digestSha256 = sha256Hex(canonical);
    const signed = this.issueSignedToken({
      subject: `author:${SERVER_AUTHOR_FINGERPRINT.fingerprintId}`,
      scope: `ownership:${SERVER_AUTHOR_FINGERPRINT.developer}`,
      ttlSeconds: 300,
    });
    return {
      fingerprint: SERVER_AUTHOR_FINGERPRINT,
      digestSha256,
      signatureToken: signed.token,
      activeKid: signed.kid,
      publicKeySpkiB64: this.activeEpoch!.meta.publicKeySpkiB64,
      epoch: signed.epoch,
      serverTime: Date.now(),
    };
  }

  private createAdminSession(): string {
    if (!this.activeEpoch) {
      this.rotateKeys('session-init');
    }
    const now = Date.now();
    const jti = crypto.randomBytes(24).toString('base64url');
    const expiresAt = now + ADMIN_SESSION_TTL_MS;
    this.adminSessions.set(jti, { jti, issuedAt: now, expiresAt });

    const issued = this.issueSignedToken({
      subject: `admin-session:${jti}`,
      scope: 'keyvault:admin',
      ttlSeconds: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
    });
    return issued.token;
  }

  public verifyAdminSession(bearerToken: string): boolean {
    const verified = this.verifySignedToken(bearerToken);
    if (!verified.valid || !verified.payload) return false;
    if (verified.payload.scope !== 'keyvault:admin') return false;
    const prefix = 'admin-session:';
    if (!verified.payload.sub.startsWith(prefix)) return false;
    const jti = verified.payload.sub.slice(prefix.length);
    const sess = this.adminSessions.get(jti);
    if (!sess) return false;
    if (Date.now() >= sess.expiresAt) {
      this.adminSessions.delete(jti);
      return false;
    }
    return true;
  }

  public revokeAdminSession(bearerToken: string): void {
    const verified = this.verifySignedToken(bearerToken);
    if (verified.payload?.sub?.startsWith('admin-session:')) {
      const jti = verified.payload.sub.slice('admin-session:'.length);
      this.adminSessions.delete(jti);
    }
  }
}

export const cryptoKeyVault = new CryptoKeyVault();
