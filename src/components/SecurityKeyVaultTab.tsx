import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { buildApiUrl } from '../utils/networkAndServer.ts';
import {
  createAttestedChallenge,
  runAntiReverseDiagnostics,
  verifyEd25519TokenClientSide,
  type AntiReverseDiagnostics,
} from '../security/antiReverseGuard.ts';

interface PublicKeyMeta {
  kid: string;
  epoch: number;
  algorithm: string;
  kdf: string;
  sealCipher: string;
  status: 'active' | 'grace' | 'retired';
  publicKeySpkiB64: string;
  fingerprintSha256: string;
  issuedAt: number;
  expiresAt: number;
  graceUntil: number;
  prevKid: string | null;
  rotationProof: string | null;
  rotationReason: string;
}

interface KeyBundleResponse {
  activeKid: string | null;
  policy: {
    autoRotateEnabled: boolean;
    rotationIntervalMs: number;
    graceWindowMs: number;
  };
  activeKey: PublicKeyMeta | null;
  graceKeys: PublicKeyMeta[];
  auditHistory: PublicKeyMeta[];
  serverTime: number;
}

interface AuthStatusResponse {
  configuredViaEnv: boolean;
  claimed: boolean;
  authenticated: boolean;
}

interface VerifyResponse {
  valid: boolean;
  reason: string;
  epochStatus?: 'active' | 'grace' | 'retired';
  header?: { alg: string; typ: string; kid: string };
  payload?: {
    iss: string;
    sub: string;
    scope: string;
    epoch: number;
    iat: number;
    exp: number;
    jti: string;
    cnf?: { jkt: string };
  };
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const SecurityKeyVaultTab: React.FC = () => {
  const { t, meta } = useLanguage();

  // Bearer token held strictly in React state memory (never stored in localStorage/sessionStorage)
  const [adminBearerToken, setAdminBearerToken] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse>({
    configuredViaEnv: false,
    claimed: false,
    authenticated: false,
  });
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  const [bundle, setBundle] = useState<KeyBundleResponse | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [policyAutoRotate, setPolicyAutoRotate] = useState<boolean>(true);
  const [policyIntervalSec, setPolicyIntervalSec] = useState<number>(900);
  const [policyGraceSec, setPolicyGraceSec] = useState<number>(300);
  const [policyNotice, setPolicyNotice] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState<string>('');
  const [issuedThumbprint, setIssuedThumbprint] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [clientVerifyNote, setClientVerifyNote] = useState<string | null>(null);
  const [isTestingToken, setIsTestingToken] = useState<boolean>(false);

  const [diagnostics, setDiagnostics] = useState<AntiReverseDiagnostics | null>(null);

  const loadVaultState = useCallback(async (tokenOverride?: string) => {
    const activeBearer = tokenOverride ?? adminBearerToken;
    const keysUrl = buildApiUrl('/api/security/public-keys');
    const authUrl = buildApiUrl('/api/security/auth-status');
    if (!keysUrl || !authUrl) return;

    try {
      const [keysRes, authRes] = await Promise.all([
        fetch(keysUrl, { cache: 'no-store' }),
        fetch(authUrl, {
          cache: 'no-store',
          headers: activeBearer ? { Authorization: `Bearer ${activeBearer}` } : {},
        }),
      ]);
      if (keysRes.ok) {
        const keysData = (await keysRes.json()) as KeyBundleResponse;
        setBundle(keysData);
        setPolicyAutoRotate(keysData.policy.autoRotateEnabled);
        setPolicyIntervalSec(Math.round(keysData.policy.rotationIntervalMs / 1000));
        setPolicyGraceSec(Math.round(keysData.policy.graceWindowMs / 1000));
      }
      if (authRes.ok) {
        const authData = (await authRes.json()) as AuthStatusResponse;
        setAuthStatus(authData);
        if (!authData.authenticated && activeBearer) {
          setAdminBearerToken('');
        }
      }
    } catch {
      // Ignore transient network failures
    }
  }, [adminBearerToken]);

  useEffect(() => {
    void loadVaultState();
    void runAntiReverseDiagnostics().then(setDiagnostics);
    const poll = globalThis.setInterval(() => {
      void loadVaultState();
    }, 15_000);
    return () => globalThis.clearInterval(poll);
  }, [loadVaultState]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const isClaimMode = !authStatus.configuredViaEnv && !authStatus.claimed;
    const endpoint = buildApiUrl(
      isClaimMode ? '/api/security/admin/claim' : '/api/security/admin/login'
    );
    if (!endpoint) return;

    setIsAuthLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error ?? 'Authentication failed.');
        return;
      }
      setAdminBearerToken(data.token);
      setPasscodeInput('');
      await loadVaultState(data.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const endpoint = buildApiUrl('/api/security/admin/logout');
    if (endpoint && adminBearerToken) {
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminBearerToken}` },
        });
      } catch {
        // Ignore network errors on logout
      }
    }
    setAdminBearerToken('');
    await loadVaultState('');
  };

  const handleRotateNow = async () => {
    setVaultError(null);
    setPolicyNotice(null);
    const endpoint = buildApiUrl('/api/security/rotate');
    if (!endpoint || !adminBearerToken) return;

    setIsRotating(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminBearerToken}`,
        },
        body: JSON.stringify({ reason: 'manual-admin-rotation' }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        bundle?: KeyBundleResponse;
        error?: string;
      };
      if (!res.ok) {
        setVaultError(data.error ?? 'Failed to rotate keys.');
        return;
      }
      if (data.bundle) {
        setBundle(data.bundle);
      } else {
        await loadVaultState();
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Rotation request failed.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleSavePolicy = async () => {
    setVaultError(null);
    setPolicyNotice(null);
    const endpoint = buildApiUrl('/api/security/policy');
    if (!endpoint || !adminBearerToken) return;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminBearerToken}`,
        },
        body: JSON.stringify({
          autoRotateEnabled: policyAutoRotate,
          rotationIntervalSeconds: policyIntervalSec,
          graceWindowSeconds: policyGraceSec,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        bundle?: KeyBundleResponse;
        error?: string;
      };
      if (!res.ok) {
        setVaultError(data.error ?? 'Failed to update rotation policy.');
        return;
      }
      if (data.bundle) {
        setBundle(data.bundle);
      }
      setPolicyNotice(t.keyVaultPolicySaved);
      globalThis.setTimeout(() => setPolicyNotice(null), 4000);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Policy update failed.');
    }
  };

  const handleIssueToken = async () => {
    setVaultError(null);
    setVerifyResult(null);
    setClientVerifyNote(null);
    const endpoint = buildApiUrl('/api/security/issue-token');
    if (!endpoint) return;

    setIsTestingToken(true);
    try {
      const challenge = await createAttestedChallenge();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'chessvision-session',
          scope: 'engine:verified',
          ttlSeconds: 300,
          nonce: challenge.nonce,
          timestamp: challenge.timestamp,
          clientPublicJwk: challenge.clientPublicJwk,
          clientProofB64Url: challenge.clientProofB64Url,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        clientThumbprint?: string;
        error?: string;
      };
      if (!res.ok || !data.token) {
        setVaultError(data.error ?? 'Token issuance failed.');
        return;
      }
      setTokenInput(data.token);
      setIssuedThumbprint(data.clientThumbprint ?? null);
      await handleVerifyToken(data.token);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Token issuance failed.');
    } finally {
      setIsTestingToken(false);
    }
  };

  const handleTamperToken = () => {
    if (!tokenInput) return;
    const parts = tokenInput.split('.');
    if (parts.length !== 3 || parts[1].length < 4) return;
    // Flip 1 character inside payload segment to simulate forgery/tampering
    const idx = Math.floor(parts[1].length / 2);
    const origChar = parts[1][idx];
    const forgedChar = origChar === 'A' ? 'B' : 'A';
    const forgedPayload = `${parts[1].slice(0, idx)}${forgedChar}${parts[1].slice(idx + 1)}`;
    setTokenInput(`${parts[0]}.${forgedPayload}.${parts[2]}`);
    setVerifyResult(null);
    setClientVerifyNote(null);
  };

  const handleVerifyToken = async (targetToken?: string) => {
    const tokenToCheck = (targetToken ?? tokenInput).trim();
    if (!tokenToCheck) return;

    const endpoint = buildApiUrl('/api/security/verify');
    if (!endpoint) return;

    setIsTestingToken(true);
    try {
      if (bundle?.activeKey?.publicKeySpkiB64) {
        const localCheck = await verifyEd25519TokenClientSide(
          tokenToCheck,
          bundle.activeKey.publicKeySpkiB64
        );
        setClientVerifyNote(localCheck.reason);
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToCheck }),
      });
      if (res.ok) {
        const data = (await res.json()) as VerifyResponse;
        setVerifyResult(data);
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsTestingToken(false);
    }
  };

  const activeKey = bundle?.activeKey ?? null;
  const remainingMs = activeKey ? Math.max(0, activeKey.expiresAt - nowMs) : 0;

  return (
    <section className="space-y-4 sm:space-y-5">
      {/* Header Banner */}
      <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
              <span>{t.keyVaultTitle}</span>
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-100 leading-relaxed">
              {t.keyVaultSubtitle}
            </p>
          </div>
          {authStatus.authenticated && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-500/25 text-emerald-100 border border-emerald-400/60">
                <Unlock className="w-3.5 h-3.5" />
                <span>{t.keyVaultUnlockedBadge}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-slate-900/40 hover:bg-slate-800/75 text-white border border-slate-400/50 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t.keyVaultLockBtn}</span>
              </button>
            </div>
          )}
        </div>

        {/* Inline First-Run Admin Claim or Unlock Form */}
        {!authStatus.authenticated && (
          <form
            onSubmit={handleAuthSubmit}
            className="p-3 sm:p-4 rounded-xl bg-slate-950/50 border border-amber-400/45 space-y-2.5"
          >
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-amber-200">
              <KeyRound className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                {!authStatus.configuredViaEnv && !authStatus.claimed
                  ? t.keyVaultAuthClaimTitle
                  : t.keyVaultAuthLoginTitle}
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {!authStatus.configuredViaEnv && !authStatus.claimed
                ? t.keyVaultAuthClaimHint
                : t.keyVaultAuthLoginHint}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder={t.keyVaultPasscodePlaceholder}
                minLength={8}
                required
                className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg bg-slate-900/80 text-white border border-slate-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                type="submit"
                disabled={isAuthLoading || passcodeInput.trim().length < 1}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors disabled:opacity-50"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span>
                  {!authStatus.configuredViaEnv && !authStatus.claimed
                    ? t.keyVaultClaimBtn
                    : t.keyVaultUnlockBtn}
                </span>
              </button>
            </div>
            {authError && (
              <p className="text-xs font-semibold text-rose-300">{authError}</p>
            )}
          </form>
        )}

        {vaultError && (
          <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-400/60 text-xs text-rose-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{vaultError}</span>
          </div>
        )}
      </div>

      {/* Top Grid: Active Key Epoch + Periodic Rotation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Active Key Epoch Metadata */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
            <h3 className="text-xs sm:text-sm font-bold text-cyan-200 flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>{t.keyVaultActiveEpochTitle}</span>
            </h3>
            {activeKey && (
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-emerald-500/25 text-emerald-200 border border-emerald-400/50">
                #{activeKey.epoch} · {t.keyVaultStatusActive}
              </span>
            )}
          </div>

          {activeKey && (
            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-200">{t.keyVaultKeyIdLabel}</span>
                <span className="font-mono font-bold text-white" dir="ltr">
                  {activeKey.kid}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-200">{t.keyVaultAlgorithmLabel}</span>
                <span className="font-mono font-bold text-cyan-200" dir="ltr">
                  {activeKey.algorithm} · {activeKey.kdf} · {activeKey.sealCipher}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 space-y-1">
                <div className="text-slate-200">{t.keyVaultFingerprintLabel}</div>
                <div
                  className="font-mono text-[11px] sm:text-xs text-emerald-200 break-all"
                  dir="ltr"
                >
                  {activeKey.fingerprintSha256}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 space-y-1">
                  <div className="text-[11px] text-slate-200 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-300" />
                    <span>{t.keyVaultNextRotationLabel}</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-white tabular-nums" dir="ltr">
                    {bundle?.policy.autoRotateEnabled ? formatCountdown(remainingMs) : 'Paused'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 space-y-1">
                  <div className="text-[11px] text-slate-200">{t.keyVaultLineageLabel}</div>
                  <div className="text-xs font-semibold text-emerald-200">
                    {activeKey.prevKid
                      ? t.keyVaultLineageSignedBy(activeKey.prevKid)
                      : t.keyVaultLineageGenesis}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Programmatic Key Rotation & Periodic Schedule */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-400/35">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>{t.keyVaultRotationControlsTitle}</span>
            </h3>
            <button
              type="button"
              onClick={() => void handleRotateNow()}
              disabled={!authStatus.authenticated || isRotating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors disabled:opacity-45"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
              <span>{isRotating ? t.keyVaultRotatingBtn : t.keyVaultRotateNowBtn}</span>
            </button>
          </div>

          {!authStatus.authenticated && (
            <p className="text-xs text-amber-200 bg-amber-500/15 border border-amber-400/45 rounded-lg p-2.5">
              {t.keyVaultLockedHint}
            </p>
          )}

          <div className="space-y-3 text-xs sm:text-sm">
            <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 cursor-pointer">
              <span className="font-semibold text-white">{t.keyVaultAutoRotateLabel}</span>
              <input
                type="checkbox"
                checked={policyAutoRotate}
                disabled={!authStatus.authenticated}
                onChange={(e) => setPolicyAutoRotate(e.target.checked)}
                className="w-4 h-4 accent-cyan-400"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  {t.keyVaultIntervalLabel}
                </label>
                <select
                  value={policyIntervalSec}
                  disabled={!authStatus.authenticated}
                  onChange={(e) => setPolicyIntervalSec(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-slate-950/75 text-white border border-slate-400/50 disabled:opacity-50"
                >
                  <option value={60}>1 min (60s)</option>
                  <option value={300}>5 min</option>
                  <option value={900}>15 min</option>
                  <option value={3600}>1 hour</option>
                  <option value={21600}>6 hours</option>
                  <option value={86400}>24 hours</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-200">
                  {t.keyVaultGraceLabel}
                </label>
                <select
                  value={policyGraceSec}
                  disabled={!authStatus.authenticated}
                  onChange={(e) => setPolicyGraceSec(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-lg bg-slate-950/75 text-white border border-slate-400/50 disabled:opacity-50"
                >
                  <option value={60}>1 min</option>
                  <option value={300}>5 min</option>
                  <option value={900}>15 min</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleSavePolicy()}
                disabled={!authStatus.authenticated}
                className="px-3.5 py-2 text-xs font-bold rounded-md bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100 border border-emerald-400/60 transition-colors disabled:opacity-45"
              >
                {t.keyVaultSavePolicyBtn}
              </button>
              {policyNotice && (
                <span className="text-xs font-semibold text-emerald-300">{policyNotice}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Unforgeable Signature & Tamper Test + Anti-Reverse-Engineering Layers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Signing & Forgery Test Lab */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-400/35">
            <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>{t.keyVaultTokenLabTitle}</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleIssueToken()}
              disabled={isTestingToken}
              className="px-3 py-1.5 text-xs font-bold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors disabled:opacity-50"
            >
              {t.keyVaultIssueTokenBtn}
            </button>
            <button
              type="button"
              onClick={handleTamperToken}
              disabled={!tokenInput}
              className="px-3 py-1.5 text-xs font-bold rounded-md bg-amber-500/25 hover:bg-amber-500/35 text-amber-100 border border-amber-400/60 transition-colors disabled:opacity-45"
            >
              {t.keyVaultTamperBtn}
            </button>
            <button
              type="button"
              onClick={() => void handleVerifyToken()}
              disabled={!tokenInput || isTestingToken}
              className="px-3 py-1.5 text-xs font-bold rounded-md bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100 border border-emerald-400/60 transition-colors disabled:opacity-45"
            >
              {t.keyVaultVerifyBtn}
            </button>
          </div>

          <textarea
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={t.keyVaultTokenPlaceholder}
            rows={4}
            dir="ltr"
            className="w-full p-2.5 text-[11px] font-mono rounded-lg bg-slate-950/75 text-cyan-100 border border-slate-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />

          {issuedThumbprint && (
            <div className="text-[11px] font-mono text-slate-200" dir="ltr">
              PoP cnf.jkt: {issuedThumbprint}
            </div>
          )}

          {verifyResult && (
            <div
              className={`p-3 rounded-lg border space-y-1 text-xs sm:text-sm ${
                verifyResult.valid
                  ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-100'
                  : 'bg-rose-500/15 border-rose-400/60 text-rose-100'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {verifyResult.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>
                  {verifyResult.valid ? t.keyVaultVerifiedValid : t.keyVaultVerifiedInvalid}
                </span>
              </div>
              <p className="text-xs leading-relaxed">{verifyResult.reason}</p>
              {clientVerifyNote && (
                <p className="text-[11px] opacity-85" dir="ltr">
                  {clientVerifyNote}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Active Obfuscation & Anti-Reverse-Engineering Shield */}
        <div className="lg:col-span-6 border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-400/35">
            <EyeOff className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{t.keyVaultShieldTitle}</span>
          </h3>

          <ul className="space-y-2 text-xs sm:text-sm">
            {[
              { text: t.keyVaultShieldItems.memorySeal, ok: true },
              {
                text: t.keyVaultShieldItems.nonExtractable,
                ok: diagnostics?.nonExtractableKeyActive ?? false,
              },
              {
                text: t.keyVaultShieldItems.obfuscatedShards,
                ok: diagnostics?.decodedDomainCheck ?? false,
              },
              { text: t.keyVaultShieldItems.antiReplay, ok: true },
              {
                text: t.keyVaultShieldItems.runtimeIntegrity,
                ok:
                  (diagnostics?.prototypeIntegrityIntact ?? false) &&
                  !(diagnostics?.timingAnomalyDetected ?? false),
              },
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-900/40 border border-slate-400/35 text-slate-100"
              >
                <Cpu
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    item.ok ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                />
                <span className="leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Audit Lineage History */}
      {bundle && bundle.auditHistory.length > 0 && (
        <div className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-white">{t.keyVaultAuditTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" dir="ltr">
              <thead>
                <tr className="border-b border-slate-400/35 text-cyan-200">
                  <th className="py-2 pr-3">Epoch / KID</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Fingerprint (SHA-256)</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {bundle.auditHistory.map((item) => (
                  <tr key={item.kid} className="border-b border-slate-500/25 text-slate-100">
                    <td className="py-2 pr-3 font-mono font-bold">
                      #{item.epoch} · {item.kid}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.status === 'active'
                            ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                            : item.status === 'grace'
                            ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
                            : 'bg-slate-800/70 text-slate-300 border-slate-500/50'
                        }`}
                      >
                        {item.status === 'active'
                          ? t.keyVaultStatusActive
                          : item.status === 'grace'
                          ? t.keyVaultStatusGrace
                          : t.keyVaultStatusRetired}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-cyan-100">
                      {item.fingerprintSha256.slice(0, 24)}…
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      {new Date(item.issuedAt).toLocaleTimeString(meta.locale, {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-2 text-[11px] text-slate-200">{item.rotationReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
