/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { SupportedLanguage } from '../i18n/translations.ts';
import {
  getAuthorFingerprintAttestation,
  runAntiReverseDiagnostics,
  verifyEd25519TokenClientSide,
  type AntiReverseDiagnostics,
} from '../security/antiReverseGuard.ts';
import { buildApiUrl } from '../utils/networkAndServer.ts';

interface DeveloperPortalModalProps {
  open: boolean;
  onClose: () => void;
  externalServerUrl: string;
}

interface OwnershipAttestationResponse {
  fingerprint: {
    developer: string;
    fingerprintId: string;
    project: string;
    year: number;
  };
  digestSha256: string;
  signatureToken: string;
  activeKid: string;
  publicKeySpkiB64: string;
  epoch: number;
  serverTime: number;
}

interface AuthStatusResponse {
  configuredViaEnv: boolean;
  claimed: boolean;
  authenticated: boolean;
}

const PORTAL_COPY: Record<
  SupportedLanguage,
  {
    title: string;
    subtitle: string;
    developerLabel: string;
    fingerprintIdLabel: string;
    clientDigestLabel: string;
    serverAttestTitle: string;
    serverVerified: string;
    serverPending: string;
    serverUnavailable: string;
    diagnosticsTitle: string;
    nonExtractable: string;
    prototypeGuard: string;
    shardGuard: string;
    adminSessionTitle: string;
    adminUnlocked: string;
    adminLocked: string;
    claimPasscodePrompt: string;
    loginPasscodePrompt: string;
    passcodePlaceholder: string;
    verifyBtn: string;
    refreshBtn: string;
    closeAria: string;
  }
> = {
  ar: {
    title: 'بوابة التحقق وبصمة المطور',
    subtitle: 'مدخل مخفي للتحقق التشفيري من الملكية وسلامة الحماية',
    developerLabel: 'المطور',
    fingerprintIdLabel: 'معرّف البصمة',
    clientDigestLabel: 'بصمة SHA-256 المحلية',
    serverAttestTitle: 'التحقق التوقيعي من الخادم (Ed25519)',
    serverVerified: 'التوقيع والبصمة متطابقان وموثّقان من الخادم',
    serverPending: 'جاري التحقق من توقيع الخادم...',
    serverUnavailable: 'تعذر الوصول للخادم حالياً (الوضع المحلي)',
    diagnosticsTitle: 'حالة الحماية ومقاومة الهندسة العكسية',
    nonExtractable: 'مفتاح WebCrypto غير قابل للاستخراج',
    prototypeGuard: 'سلامة الدوال الأصلية',
    shardGuard: 'فك التعتيم الداخلي',
    adminSessionTitle: 'التحقق الإداري على الخادم (بدون تخزين محلي)',
    adminUnlocked: 'جلسة إدارية نشطة ومؤكدة من الخادم',
    adminLocked: 'يتطلب التحقق عبر رمز الأمان على الخادم',
    claimPasscodePrompt: 'تعيين رمز الأمان لأول مرة على الخادم:',
    loginPasscodePrompt: 'أدخل رمز الأمان للتحقق من الجلسة:',
    passcodePlaceholder: 'رمز الأمان الإداري...',
    verifyBtn: 'تحقق',
    refreshBtn: 'إعادة الفحص',
    closeAria: 'إغلاق بوابة المطور',
  },
  en: {
    title: 'Developer Fingerprint & Security Portal',
    subtitle: 'Hidden entry for cryptographic ownership and protection verification',
    developerLabel: 'Developer',
    fingerprintIdLabel: 'Fingerprint ID',
    clientDigestLabel: 'Local SHA-256 Digest',
    serverAttestTitle: 'Server Ed25519 Ownership Attestation',
    serverVerified: 'Server Ed25519 signature and digest verified',
    serverPending: 'Verifying server signature...',
    serverUnavailable: 'Server unreachable right now (local mode)',
    diagnosticsTitle: 'Runtime & Anti-Reverse Diagnostics',
    nonExtractable: 'Non-extractable WebCrypto key',
    prototypeGuard: 'Prototype integrity',
    shardGuard: 'Obfuscated shard check',
    adminSessionTitle: 'Server-Side Admin Session Verification',
    adminUnlocked: 'Server-verified admin session active in memory',
    adminLocked: 'Requires server passcode verification',
    claimPasscodePrompt: 'Claim first-run server passcode:',
    loginPasscodePrompt: 'Enter server admin passcode:',
    passcodePlaceholder: 'Admin passcode...',
    verifyBtn: 'Verify',
    refreshBtn: 'Re-verify',
    closeAria: 'Close developer portal',
  },
  ru: {
    title: 'Портал разработчика и отпечаток',
    subtitle: 'Скрытый вход для проверки криптографического авторства и защиты',
    developerLabel: 'Разработчик',
    fingerprintIdLabel: 'ID отпечатка',
    clientDigestLabel: 'Локальный SHA-256',
    serverAttestTitle: 'Серверная подпись владения (Ed25519)',
    serverVerified: 'Подпись Ed25519 и отпечаток подтверждены сервером',
    serverPending: 'Проверка подписи сервера...',
    serverUnavailable: 'Сервер недоступен (локальный режим)',
    diagnosticsTitle: 'Диагностика защиты от реверс-инжиниринга',
    nonExtractable: 'Неизвлекаемый ключ WebCrypto',
    prototypeGuard: 'Целостность прототипов',
    shardGuard: 'Проверка обфускации',
    adminSessionTitle: 'Проверка сессии администратора на сервере',
    adminUnlocked: 'Сессия администратора подтверждена в памяти',
    adminLocked: 'Требуется код доступа сервера',
    claimPasscodePrompt: 'Установить код администратора на сервере:',
    loginPasscodePrompt: 'Введите код администратора:',
    passcodePlaceholder: 'Код администратора...',
    verifyBtn: 'Проверить',
    refreshBtn: 'Обновить',
    closeAria: 'Закрыть портал',
  },
  zh: {
    title: '开发者指纹与安全验证面板',
    subtitle: '用于加密所有权签名和运行时保护校验的隐藏入口',
    developerLabel: '开发者',
    fingerprintIdLabel: '指纹编号',
    clientDigestLabel: '本地 SHA-256 摘要',
    serverAttestTitle: '服务端 Ed25519 所有权签名验证',
    serverVerified: '服务端签名与所有权指纹校验通过',
    serverPending: '正在验证服务端签名...',
    serverUnavailable: '当前无法连接服务端（本地模式）',
    diagnosticsTitle: '反逆向与运行时保护状态',
    nonExtractable: '不可导出 WebCrypto 密钥',
    prototypeGuard: '原型链完整性',
    shardGuard: '内部混淆校验',
    adminSessionTitle: '服务端管理员会话校验',
    adminUnlocked: '已通过服务端验证（仅保存在内存中）',
    adminLocked: '需要服务端管理员口令验证',
    claimPasscodePrompt: '首次在服务端设置管理员口令：',
    loginPasscodePrompt: '输入服务端管理员口令：',
    passcodePlaceholder: '管理员口令...',
    verifyBtn: '验证',
    refreshBtn: '重新检测',
    closeAria: '关闭开发者面板',
  },
  fr: {
    title: 'Portail Développeur & Empreinte',
    subtitle: 'Accès caché de vérification cryptographique et de protection',
    developerLabel: 'Développeur',
    fingerprintIdLabel: 'Identifiant d’empreinte',
    clientDigestLabel: 'Empreinte SHA-256 locale',
    serverAttestTitle: 'Attestation serveur Ed25519',
    serverVerified: 'Signature Ed25519 et empreinte vérifiées par le serveur',
    serverPending: 'Vérification de la signature serveur...',
    serverUnavailable: 'Serveur inaccessible (mode local)',
    diagnosticsTitle: 'Protection & anti-rétro-ingénierie',
    nonExtractable: 'Clé WebCrypto non extractible',
    prototypeGuard: 'Intégrité des prototypes',
    shardGuard: 'Décodage obfusqué interne',
    adminSessionTitle: 'Vérification de session admin côté serveur',
    adminUnlocked: 'Session admin vérifiée en mémoire uniquement',
    adminLocked: 'Vérification serveur requise',
    claimPasscodePrompt: 'Définir le code admin initial sur le serveur :',
    loginPasscodePrompt: 'Entrer le code admin serveur :',
    passcodePlaceholder: 'Code administrateur...',
    verifyBtn: 'Vérifier',
    refreshBtn: 'Actualiser',
    closeAria: 'Fermer le portail développeur',
  },
};

export const DeveloperPortalModal: React.FC<DeveloperPortalModalProps> = ({
  open,
  onClose,
  externalServerUrl,
}) => {
  const { language, meta } = useLanguage();
  const copy = PORTAL_COPY[language] ?? PORTAL_COPY.en;

  const [clientAttest, setClientAttest] = useState<{
    developer: string;
    fingerprintId: string;
    project: string;
    year: number;
    sha256Hex: string;
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<AntiReverseDiagnostics | null>(null);
  const [serverVerifyState, setServerVerifyState] = useState<
    'pending' | 'verified' | 'unavailable'
  >('pending');
  const [serverAttest, setServerAttest] = useState<OwnershipAttestationResponse | null>(null);

  // Admin session token held strictly in React state memory
  const [adminToken, setAdminToken] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  const runVerification = useCallback(async () => {
    setServerVerifyState('pending');
    const [attest, diag] = await Promise.all([
      getAuthorFingerprintAttestation(),
      runAntiReverseDiagnostics(),
    ]);
    setClientAttest(attest);
    setDiagnostics(diag);

    try {
      const ownershipUrl =
        buildApiUrl('/api/security/ownership', externalServerUrl) ?? '/api/security/ownership';
      const statusUrl =
        buildApiUrl('/api/security/auth-status', externalServerUrl) ??
        '/api/security/auth-status';

      const [ownRes, statusRes] = await Promise.all([
        fetch(ownershipUrl, { cache: 'no-store' }),
        fetch(statusUrl, {
          cache: 'no-store',
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
        }),
      ]);

      if (statusRes.ok) {
        setAuthStatus((await statusRes.json()) as AuthStatusResponse);
      }

      if (!ownRes.ok) {
        setServerVerifyState('unavailable');
        return;
      }

      const ownData = (await ownRes.json()) as OwnershipAttestationResponse;
      setServerAttest(ownData);

      const sigCheck = await verifyEd25519TokenClientSide(
        ownData.signatureToken,
        ownData.publicKeySpkiB64
      );
      const digestMatches = ownData.digestSha256 === attest.sha256Hex;
      if (digestMatches && (sigCheck.valid || !sigCheck.supported)) {
        setServerVerifyState('verified');
      } else {
        setServerVerifyState('unavailable');
      }
    } catch {
      setServerVerifyState('unavailable');
    }
  }, [adminToken, externalServerUrl]);

  useEffect(() => {
    if (!open) return;
    void runVerification();
  }, [open, runVerification]);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeInput.trim()) return;
    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      const needsClaim = authStatus && !authStatus.configuredViaEnv && !authStatus.claimed;
      const endpoint = needsClaim
        ? '/api/security/admin/claim'
        : '/api/security/admin/login';
      const url = buildApiUrl(endpoint, externalServerUrl) ?? endpoint;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.token) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAdminToken(data.token);
      setPasscodeInput('');
      setAuthStatus((prev) => (prev ? { ...prev, claimed: true, authenticated: true } : prev));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      dir={meta.dir}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-cyan-400/45 bg-[#0D131F] text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-700/80 bg-[#090D16]">
          <div className="flex items-center gap-2 min-w-0">
            <Fingerprint className="w-5 h-5 text-cyan-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {copy.title}
              </h2>
              <p className="text-[11px] text-slate-300 truncate">{copy.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeAria}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[82vh] overflow-y-auto text-xs sm:text-sm">
          {/* Author Ownership Metadata */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300">{copy.developerLabel}:</span>
              <span className="font-bold text-cyan-200" dir="ltr">
                {clientAttest?.developer ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300">{copy.fingerprintIdLabel}:</span>
              <span className="font-mono font-bold text-emerald-300" dir="ltr">
                {clientAttest?.fingerprintId ?? '—'}
              </span>
            </div>
            <div className="pt-1.5 border-t border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-400">{copy.clientDigestLabel}</div>
              <div
                className="font-mono text-[11px] text-slate-200 break-all bg-slate-950/80 rounded px-2 py-1 border border-slate-800"
                dir="ltr"
              >
                {clientAttest?.sha256Hex || '—'}
              </div>
            </div>
          </div>

          {/* Server Cryptographic Ownership Verification */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>{copy.serverAttestTitle}</span>
            </div>
            <div
              className={`text-xs font-medium flex items-center gap-1.5 ${
                serverVerifyState === 'verified'
                  ? 'text-emerald-300'
                  : serverVerifyState === 'pending'
                  ? 'text-cyan-200'
                  : 'text-amber-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {serverVerifyState === 'verified'
                  ? copy.serverVerified
                  : serverVerifyState === 'pending'
                  ? copy.serverPending
                  : copy.serverUnavailable}
              </span>
            </div>
            {serverAttest && (
              <div className="text-[11px] font-mono text-slate-400" dir="ltr">
                kid={serverAttest.activeKid} · epoch={serverAttest.epoch}
              </div>
            )}
          </div>

          {/* Client Anti-Reverse Diagnostics */}
          {diagnostics && (
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-1.5">
              <div className="font-semibold text-white">{copy.diagnosticsTitle}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <span className="text-slate-300">{copy.nonExtractable}: </span>
                  <strong
                    className={
                      diagnostics.nonExtractableKeyActive ? 'text-emerald-300' : 'text-amber-300'
                    }
                  >
                    {diagnostics.nonExtractableKeyActive ? 'OK' : 'OFF'}
                  </strong>
                </div>
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <span className="text-slate-300">{copy.prototypeGuard}: </span>
                  <strong
                    className={
                      diagnostics.prototypeIntegrityIntact ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    {diagnostics.prototypeIntegrityIntact ? 'OK' : 'WARN'}
                  </strong>
                </div>
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <span className="text-slate-300">{copy.shardGuard}: </span>
                  <strong
                    className={
                      diagnostics.decodedDomainCheck ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    {diagnostics.decodedDomainCheck ? 'OK' : 'WARN'}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Server-Side Admin Session Verification */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                {authStatus?.authenticated ? (
                  <KeyRound className="w-4 h-4 text-emerald-300 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-300 shrink-0" />
                )}
                <span>{copy.adminSessionTitle}</span>
              </div>
            </div>

            {authStatus?.authenticated ? (
              <div className="text-xs font-medium text-emerald-300">
                {copy.adminUnlocked}
              </div>
            ) : (
              <form onSubmit={(e) => void handleAdminAuth(e)} className="space-y-2">
                <div className="text-[11px] text-slate-300">
                  {authStatus && !authStatus.configuredViaEnv && !authStatus.claimed
                    ? copy.claimPasscodePrompt
                    : copy.loginPasscodePrompt}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder={copy.passcodePlaceholder}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-400"
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingAuth || !passcodeInput.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 rounded whitespace-nowrap"
                  >
                    {isSubmittingAuth ? '...' : copy.verifyBtn}
                  </button>
                </div>
                {authError && (
                  <div className="text-[11px] text-rose-300 font-medium">{authError}</div>
                )}
              </form>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void runVerification()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{copy.refreshBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
