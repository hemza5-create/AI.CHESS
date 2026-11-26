/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  WifiOff,
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
import {
  localStockfishEngine,
  type LocalEngineVerificationResult,
} from '../engine/localStockfishEngine.ts';
import {
  API_ROUTES,
  APP_VERSION,
  buildApiUrl,
  DEFAULT_EXTERNAL_SERVER_ID,
  getAuthorizedClientHeaders,
  getServerIdHeaders,
  safeParseJsonBody,
  type ActiveEngineSource,
  type RemoteServerStatus,
} from '../utils/networkAndServer.ts';

interface StockfishVersionInfo {
  installedVersion: string;
  installedSource: 'official-auto-update' | 'bundled';
  officialReleaseTag: string | null;
  officialReleaseName: string | null;
  officialReleaseUrl: string;
  latestWasmVersion: string | null;
  updateAvailable: boolean;
  wasmScript: string;
  asmScript: string | null;
  updatedAt: string | null;
  filesCount: number;
}

interface DeveloperPortalModalProps {
  open: boolean;
  onClose: () => void;
  externalServerUrl: string;
  externalServerId?: string;
  adminToken: string;
  onAdminTokenChange: (nextToken: string) => void;
  onOpenKeyVault: () => void;
  onLockAndHide: () => void;
  isOnline: boolean;
  activeEngineSource: ActiveEngineSource;
  localEngineVerify: LocalEngineVerificationResult | null;
  isVerifyingEngine: boolean;
  onVerifyLocalEngine: () => void;
  onEngineAutoUpdated?: () => void;
  remoteServerStatus: RemoteServerStatus;
  onSaveExternalServerUrl: (url: string) => void;
  onSaveExternalServerId: (id: string) => void;
  onReconnectServer: () => void;
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
    subtitleLocked: string;
    subtitleUnlocked: string;
    hiddenNotice: string;
    developerLabel: string;
    fingerprintIdLabel: string;
    appVersionLabel: string;
    serverIdLabel: string;
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
    openKeyVaultBtn: string;
    rotateKeysNowBtn: string;
    rotatingKeysBtn: string;
    rotatedSuccess: (kid: string) => string;
    lockHideBtn: string;
    refreshBtn: string;
    closeAria: string;
  }
> = {
  ar: {
    title: 'AI_CHESS',
    subtitleLocked: 'منطقة محمية — أدخل رمز الأمان لإظهار المعلومات المخفية وفتح إدارة المفاتيح',
    subtitleUnlocked: 'المعلومات المخفية وبوابة التحقق وإدارة تدوير المفاتيح',
    hiddenNotice: 'المعلومات التشفيرية وهوية المطور وإدارة المفاتيح مخفية حتى التحقق من الخادم.',
    developerLabel: 'المطور',
    fingerprintIdLabel: 'معرّف البصمة',
    appVersionLabel: 'إصدار التطبيق',
    serverIdLabel: 'معرّف الخادم النشط',
    clientDigestLabel: 'بصمة SHA-256 المحلية',
    serverAttestTitle: 'التحقق التوقيعي من الخادم (Ed25519)',
    serverVerified: 'التوقيع والبصمة متطابقان وموثّقان من الخادم',
    serverPending: 'جاري التحقق من توقيع الخادم...',
    serverUnavailable: 'تعذر الوصول للخادم حالياً (الوضع المحلي)',
    diagnosticsTitle: 'حالة الحماية ومقاومة الهندسة العكسية',
    nonExtractable: 'مفتاح WebCrypto غير قابل للاستخراج',
    prototypeGuard: 'سلامة الدوال الأصلية',
    shardGuard: 'فك التعتيم الداخلي',
    adminSessionTitle: 'صلاحية إدارة وتدوير المفاتيح',
    adminUnlocked: 'الصلاحية مفتوحة — جلسة إدارية نشطة ومؤكدة من الخادم',
    adminLocked: 'يتطلب التحقق عبر رمز الأمان على الخادم',
    claimPasscodePrompt: 'تعيين رمز الأمان لأول مرة على الخادم:',
    loginPasscodePrompt: 'أدخل رمز الأمان للتحقق وفتح الصلاحية:',
    passcodePlaceholder: 'رمز الأمان الإداري...',
    verifyBtn: 'فتح الصلاحية',
    openKeyVaultBtn: 'فتح لوحة إدارة وتدوير المفاتيح',
    rotateKeysNowBtn: 'تدوير المفاتيح الآن',
    rotatingKeysBtn: 'جاري التدوير...',
    rotatedSuccess: (kid) => `تم تدوير المفتاح بنجاح (${kid})`,
    lockHideBtn: 'قفل وإخفاء',
    refreshBtn: 'إعادة الفحص',
    closeAria: 'إغلاق بوابة AI_CHESS',
  },
  en: {
    title: 'AI_CHESS',
    subtitleLocked: 'Protected vault — verify server passcode to reveal hidden details & unlock key rotation',
    subtitleUnlocked: 'Hidden ownership details & key management controls',
    hiddenNotice: 'Developer metadata, diagnostics, and key rotation controls stay hidden until server unlock.',
    developerLabel: 'Developer',
    fingerprintIdLabel: 'Fingerprint ID',
    appVersionLabel: 'App Version',
    serverIdLabel: 'Active Server ID',
    clientDigestLabel: 'Local SHA-256 Digest',
    serverAttestTitle: 'Server Ed25519 Ownership Attestation',
    serverVerified: 'Server Ed25519 signature and digest verified',
    serverPending: 'Verifying server signature...',
    serverUnavailable: 'Server unreachable right now (local mode)',
    diagnosticsTitle: 'Runtime & Anti-Reverse Diagnostics',
    nonExtractable: 'Non-extractable WebCrypto key',
    prototypeGuard: 'Prototype integrity',
    shardGuard: 'Obfuscated shard check',
    adminSessionTitle: 'Key Management & Rotation Permission',
    adminUnlocked: 'Unlocked — server-verified admin session active',
    adminLocked: 'Requires server passcode verification',
    claimPasscodePrompt: 'Claim first-run server passcode:',
    loginPasscodePrompt: 'Enter server admin passcode:',
    passcodePlaceholder: 'Admin passcode...',
    verifyBtn: 'Unlock',
    openKeyVaultBtn: 'Open Key Management & Rotation',
    rotateKeysNowBtn: 'Rotate Keys Now',
    rotatingKeysBtn: 'Rotating...',
    rotatedSuccess: (kid) => `Keys rotated cleanly (${kid})`,
    lockHideBtn: 'Lock & Hide',
    refreshBtn: 'Re-verify',
    closeAria: 'Close AI_CHESS portal',
  },
  ru: {
    title: 'AI_CHESS',
    subtitleLocked: 'Скрытый раздел — введите код сервера для доступа и управления ключами',
    subtitleUnlocked: 'Скрытые данные разработчика и ротация ключей',
    hiddenNotice: 'Метаданные и управление ключами скрыты до подтверждения на сервере.',
    developerLabel: 'Разработчик',
    fingerprintIdLabel: 'ID отпечатка',
    appVersionLabel: 'Версия приложения',
    serverIdLabel: 'Активный ID сервера',
    clientDigestLabel: 'Локальный SHA-256',
    serverAttestTitle: 'Серверная подпись владения (Ed25519)',
    serverVerified: 'Подпись Ed25519 и отпечаток подтверждены сервером',
    serverPending: 'Проверка подписи сервера...',
    serverUnavailable: 'Сервер недоступен (локальный режим)',
    diagnosticsTitle: 'Диагностика защиты от реверс-инжиниринга',
    nonExtractable: 'Неизвлекаемый ключ WebCrypto',
    prototypeGuard: 'Целостность прототипов',
    shardGuard: 'Проверка обфускации',
    adminSessionTitle: 'Управление и ротация ключей',
    adminUnlocked: 'Доступ открыт — сессия подтверждена сервером',
    adminLocked: 'Требуется код доступа сервера',
    claimPasscodePrompt: 'Установить код администратора на сервере:',
    loginPasscodePrompt: 'Введите код администратора:',
    passcodePlaceholder: 'Код администратора...',
    verifyBtn: 'Открыть',
    openKeyVaultBtn: 'Открыть управление и ротацию ключей',
    rotateKeysNowBtn: 'Ротировать ключи',
    rotatingKeysBtn: 'Ротация...',
    rotatedSuccess: (kid) => `Ключ обновлён (${kid})`,
    lockHideBtn: 'Заблокировать и скрыть',
    refreshBtn: 'Обновить',
    closeAria: 'Закрыть AI_CHESS',
  },
  zh: {
    title: 'AI_CHESS',
    subtitleLocked: '受保护入口 — 验证服务端管理员口令以查看隐藏信息并解锁密钥轮换',
    subtitleUnlocked: '隐藏开发者信息与密钥轮换管理',
    hiddenNotice: '在完成服务端管理员验证前，所有隐藏信息与密钥管理均处于隐藏状态。',
    developerLabel: '开发者',
    fingerprintIdLabel: '指纹编号',
    appVersionLabel: '应用版本',
    serverIdLabel: '当前服务器 ID',
    clientDigestLabel: '本地 SHA-256 摘要',
    serverAttestTitle: '服务端 Ed25519 所有权签名验证',
    serverVerified: '服务端签名与所有权指纹校验通过',
    serverPending: '正在验证服务端签名...',
    serverUnavailable: '当前无法连接服务端（本地模式）',
    diagnosticsTitle: '反逆向与运行时保护状态',
    nonExtractable: '不可导出 WebCrypto 密钥',
    prototypeGuard: '原型链完整性',
    shardGuard: '内部混淆校验',
    adminSessionTitle: '密钥管理与轮换权限',
    adminUnlocked: '已解锁 — 服务端管理员会话有效',
    adminLocked: '需要服务端管理员口令验证',
    claimPasscodePrompt: '首次在服务端设置管理员口令：',
    loginPasscodePrompt: '输入服务端管理员口令：',
    passcodePlaceholder: '管理员口令...',
    verifyBtn: '解锁权限',
    openKeyVaultBtn: '打开密钥管理与轮换面板',
    rotateKeysNowBtn: '立即轮换密钥',
    rotatingKeysBtn: '正在轮换...',
    rotatedSuccess: (kid) => `密钥轮换成功 (${kid})`,
    lockHideBtn: '锁定并隐藏',
    refreshBtn: '重新检测',
    closeAria: '关闭 AI_CHESS',
  },
  fr: {
    title: 'AI_CHESS',
    subtitleLocked: 'Zone protégée — vérifiez le code serveur pour révéler les infos et gérer les clés',
    subtitleUnlocked: 'Informations masquées & gestion de rotation des clés',
    hiddenNotice: 'Les métadonnées et la gestion des clés restent masquées jusqu’au déverrouillage serveur.',
    developerLabel: 'Développeur',
    fingerprintIdLabel: 'Identifiant d’empreinte',
    appVersionLabel: 'Version de l’app',
    serverIdLabel: 'ID serveur actif',
    clientDigestLabel: 'Empreinte SHA-256 locale',
    serverAttestTitle: 'Attestation serveur Ed25519',
    serverVerified: 'Signature Ed25519 et empreinte vérifiées par le serveur',
    serverPending: 'Vérification de la signature serveur...',
    serverUnavailable: 'Serveur inaccessible (mode local)',
    diagnosticsTitle: 'Protection & anti-rétro-ingénierie',
    nonExtractable: 'Clé WebCrypto non extractible',
    prototypeGuard: 'Intégrité des prototypes',
    shardGuard: 'Décodage obfusqué interne',
    adminSessionTitle: 'Permission de gestion et rotation des clés',
    adminUnlocked: 'Déverrouillé — session admin vérifiée côté serveur',
    adminLocked: 'Vérification serveur requise',
    claimPasscodePrompt: 'Définir le code admin initial sur le serveur :',
    loginPasscodePrompt: 'Entrer le code admin serveur :',
    passcodePlaceholder: 'Code administrateur...',
    verifyBtn: 'Déverrouiller',
    openKeyVaultBtn: 'Ouvrir gestion & rotation des clés',
    rotateKeysNowBtn: 'Pivoter les clés',
    rotatingKeysBtn: 'Rotation...',
    rotatedSuccess: (kid) => `Clé renouvelée (${kid})`,
    lockHideBtn: 'Verrouiller et masquer',
    refreshBtn: 'Actualiser',
    closeAria: 'Fermer AI_CHESS',
  },
};

export const DeveloperPortalModal: React.FC<DeveloperPortalModalProps> = ({
  open,
  onClose,
  externalServerUrl,
  externalServerId,
  adminToken,
  onAdminTokenChange,
  onOpenKeyVault,
  onLockAndHide,
  isOnline,
  activeEngineSource,
  localEngineVerify,
  isVerifyingEngine,
  onVerifyLocalEngine,
  onEngineAutoUpdated,
  remoteServerStatus,
  onSaveExternalServerUrl,
  onSaveExternalServerId,
  onReconnectServer,
}) => {
  const { language, meta, t } = useLanguage();
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

  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [isRotatingQuick, setIsRotatingQuick] = useState<boolean>(false);
  const [rotateStatusMsg, setRotateStatusMsg] = useState<string | null>(null);

  const [versionInfo, setVersionInfo] = useState<StockfishVersionInfo | null>(null);
  const [isAutoUpdating, setIsAutoUpdating] = useState<boolean>(false);
  const [autoUpdateNotice, setAutoUpdateNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [serverUrlDraft, setServerUrlDraft] = useState<string>(externalServerUrl);
  const [serverIdDraft, setServerIdDraft] = useState<string>(
    externalServerId || DEFAULT_EXTERNAL_SERVER_ID
  );

  const isAdminUnlocked = Boolean(adminToken && authStatus?.authenticated);

  useEffect(() => {
    setServerUrlDraft(externalServerUrl);
  }, [externalServerUrl]);

  useEffect(() => {
    setServerIdDraft(externalServerId || DEFAULT_EXTERNAL_SERVER_ID);
  }, [externalServerId]);

  const runVerification = useCallback(
    async (tokenOverride?: string) => {
      const effectiveToken = tokenOverride ?? adminToken;
      const serverHeaders = getServerIdHeaders(externalServerId);
      const statusUrl =
        buildApiUrl(API_ROUTES.vaultAuthStatus, externalServerUrl) ??
        API_ROUTES.vaultAuthStatus;

      try {
        const statusRes = await fetch(statusUrl, {
          cache: 'no-store',
          headers: effectiveToken
            ? { ...serverHeaders, Authorization: `Bearer ${effectiveToken}` }
            : serverHeaders,
        });
        const statusParsed = await safeParseJsonBody<AuthStatusResponse>(statusRes);
        if (statusParsed.ok && statusParsed.data) {
          setAuthStatus(statusParsed.data);
          if (!statusParsed.data.authenticated) {
            if (effectiveToken) {
              onAdminTokenChange('');
            }
            setClientAttest(null);
            setDiagnostics(null);
            setServerAttest(null);
            setVersionInfo(null);
            return;
          }
        } else {
          return;
        }
      } catch {
        return;
      }

      // Only compute and fetch hidden ownership, Stockfish version, and diagnostic details after server authentication succeeds
      setServerVerifyState('pending');
      const [attest, diag] = await Promise.all([
        getAuthorFingerprintAttestation(),
        runAntiReverseDiagnostics(),
      ]);
      setClientAttest(attest);
      setDiagnostics(diag);

      if (isOnline) {
        try {
          const verUrl =
            buildApiUrl(API_ROUTES.engineVersion, externalServerUrl) ??
            API_ROUTES.engineVersion;
          const verHeaders = await getAuthorizedClientHeaders(
            externalServerUrl,
            externalServerId
          );
          const verRes = await fetch(verUrl, { cache: 'no-store', headers: verHeaders });
          const verParsed = await safeParseJsonBody<StockfishVersionInfo>(verRes);
          if (
            verParsed.ok &&
            verParsed.data &&
            typeof verParsed.data.installedVersion === 'string'
          ) {
            setVersionInfo(verParsed.data);
          }
        } catch {
          // ignore offline or transient version check errors
        }
      }

      try {
        const ownershipUrl =
          buildApiUrl(API_ROUTES.ownership, externalServerUrl) ?? API_ROUTES.ownership;
        const clientAuthHeaders = await getAuthorizedClientHeaders(
          externalServerUrl,
          externalServerId
        );
        const ownRes = await fetch(ownershipUrl, {
          cache: 'no-store',
          headers: clientAuthHeaders,
        });
        const ownParsed = await safeParseJsonBody<OwnershipAttestationResponse>(ownRes);
        if (!ownParsed.ok || !ownParsed.data) {
          setServerVerifyState('unavailable');
          return;
        }
        const ownData = ownParsed.data;
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
    },
    [adminToken, externalServerId, externalServerUrl, isOnline, onAdminTokenChange]
  );

  useEffect(() => {
    if (!open) return;
    setRotateStatusMsg(null);
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
        ? API_ROUTES.vaultAdminClaim
        : API_ROUTES.vaultAdminLogin;
      const url = buildApiUrl(endpoint, externalServerUrl) ?? endpoint;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getServerIdHeaders(externalServerId),
        },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const parsed = await safeParseJsonBody<{
        ok?: boolean;
        token?: string;
        error?: string;
      }>(res, 'Authentication failed');
      if (!parsed.ok || !parsed.data?.token) {
        throw new Error(parsed.error || `HTTP ${res.status}`);
      }
      onAdminTokenChange(parsed.data.token);
      setPasscodeInput('');
      setAuthStatus((prev) => (prev ? { ...prev, claimed: true, authenticated: true } : prev));
      await runVerification(parsed.data.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleQuickRotate = async () => {
    if (!adminToken) return;
    setIsRotatingQuick(true);
    setAuthError(null);
    setRotateStatusMsg(null);
    try {
      const endpoint = API_ROUTES.vaultRotate;
      const url = buildApiUrl(endpoint, externalServerUrl) ?? endpoint;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getServerIdHeaders(externalServerId),
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reason: 'ai-chess-portal-rotation' }),
      });
      const parsed = await safeParseJsonBody<{
        ok?: boolean;
        rotatedKey?: { kid?: string };
        error?: string;
      }>(res, 'Key rotation failed');
      if (!parsed.ok || !parsed.data?.ok) {
        if (res.status === 401) {
          onAdminTokenChange('');
          setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
        }
        throw new Error(parsed.error || `HTTP ${res.status}`);
      }
      const nextKid = parsed.data.rotatedKey?.kid ?? 'new-epoch';
      setRotateStatusMsg(copy.rotatedSuccess(nextKid));
      await runVerification();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRotatingQuick(false);
    }
  };

  const handleExecuteStockfishAutoUpdate = async () => {
    if (!adminToken) return;
    setIsAutoUpdating(true);
    setAutoUpdateNotice(null);
    try {
      const updateUrl =
        buildApiUrl(API_ROUTES.engineAutoUpdate, externalServerUrl) ??
        API_ROUTES.engineAutoUpdate;
      const res = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getServerIdHeaders(externalServerId),
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({}),
      });

      type AutoUpdatePayload = {
        ok?: boolean;
        error?: string;
        manifest?: {
          packageVersion: string;
          wasmScript: string;
          asmScript: string | null;
          updatedAt: string;
          files: { name: string }[];
        };
        status?: StockfishVersionInfo;
      };

      const parsed = await safeParseJsonBody<AutoUpdatePayload>(res, 'Auto-update failed');
      const payload = parsed.data ?? {};

      if (res.status === 401) {
        onAdminTokenChange('');
        setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
        throw new Error(parsed.error || payload.error || `HTTP ${res.status}`);
      }

      if (!parsed.ok || !payload.ok || !payload.manifest) {
        throw new Error(parsed.error || payload.error || `HTTP ${res.status}`);
      }

      if (payload.status) {
        setVersionInfo(payload.status);
      }

      if ('caches' in globalThis) {
        try {
          const keys = await globalThis.caches.keys();
          for (const k of keys) {
            if (k.includes('stockfish') || k.includes('workbox')) {
              const cache = await globalThis.caches.open(k);
              const requests = await cache.keys();
              await Promise.all(
                requests
                  .filter((reqItem) => reqItem.url.includes('/stockfish/'))
                  .map((reqItem) => cache.delete(reqItem))
              );
            }
          }
        } catch {
          // ignore CacheStorage cleanup errors
        }
      }

      localStockfishEngine.reloadWithVersion(payload.manifest.updatedAt, {
        wasmJs: payload.manifest.wasmScript,
        asmJs: payload.manifest.asmScript,
      });

      setAutoUpdateNotice({
        ok: true,
        text: t.stockfishUpdateSuccess(
          payload.manifest.packageVersion,
          payload.manifest.files.length
        ),
      });
      onVerifyLocalEngine();
      onEngineAutoUpdated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoUpdateNotice({
        ok: false,
        text: t.stockfishUpdateFailed(msg),
      });
    } finally {
      setIsAutoUpdating(false);
    }
  };

  const handleLockAndHideClick = async () => {
    const endpoint = API_ROUTES.vaultAdminLogout;
    const url = buildApiUrl(endpoint, externalServerUrl) ?? endpoint;
    if (adminToken) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            ...getServerIdHeaders(externalServerId),
            Authorization: `Bearer ${adminToken}`,
          },
        });
      } catch {
        // Ignore network errors
      }
    }
    onAdminTokenChange('');
    setClientAttest(null);
    setDiagnostics(null);
    setServerAttest(null);
    setVersionInfo(null);
    setAutoUpdateNotice(null);
    setRotateStatusMsg(null);
    setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
    onLockAndHide();
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
      <div
        className={`w-full ${
          isAdminUnlocked ? 'max-w-2xl' : 'max-w-lg'
        } rounded-2xl border border-cyan-400/45 bg-[#0D131F] text-slate-100 shadow-2xl overflow-hidden`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-700/80 bg-[#090D16]">
          <div className="flex items-center gap-2 min-w-0">
            <Fingerprint className="w-5 h-5 text-cyan-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold font-mono text-white truncate" dir="ltr">
                {copy.title}
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                {isAdminUnlocked ? copy.subtitleUnlocked : copy.subtitleLocked}
              </p>
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
          {/* Server-Side Admin Session & Key Rotation Permission */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                {isAdminUnlocked ? (
                  <KeyRound className="w-4 h-4 text-emerald-300 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-300 shrink-0" />
                )}
                <span>{copy.adminSessionTitle}</span>
              </div>
            </div>

            {isAdminUnlocked ? (
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-emerald-300">
                  {copy.adminUnlocked}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenKeyVault}
                    className="px-3 py-1.5 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors"
                  >
                    {copy.openKeyVaultBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickRotate()}
                    disabled={isRotatingQuick}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100 border border-emerald-400/60 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRotatingQuick ? 'animate-spin' : ''}`} />
                    <span>{isRotatingQuick ? copy.rotatingKeysBtn : copy.rotateKeysNowBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLockAndHideClick()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 rounded-lg transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{copy.lockHideBtn}</span>
                  </button>
                </div>
                {rotateStatusMsg && (
                  <div className="text-[11px] font-medium text-emerald-300">{rotateStatusMsg}</div>
                )}
                {authError && (
                  <div className="text-[11px] text-rose-300 font-medium">{authError}</div>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => void handleAdminAuth(e)} className="space-y-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">{copy.hiddenNotice}</p>
                <div className="text-[11px] text-amber-200 font-medium">
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

          {/* Hidden Ownership, Version, Server ID & Diagnostics (only revealed after unlock) */}
          {isAdminUnlocked && (
            <>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">{copy.appVersionLabel}:</span>
                  <span className="font-mono font-bold text-white" dir="ltr">
                    v{APP_VERSION}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">{copy.serverIdLabel}:</span>
                  <span className="font-mono font-bold text-cyan-300" dir="ltr">
                    {externalServerId || DEFAULT_EXTERNAL_SERVER_ID}
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

              {/* Hidden Local Stockfish WebAssembly Engine & External API Server Box */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold">
                    {!isOnline ? (
                      <>
                        <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
                        <span className="text-amber-200">{t.engineOfflineLocal}</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-4 h-4 text-cyan-300 shrink-0" />
                        <span className="text-cyan-200">
                          {activeEngineSource === 'local-asm'
                            ? t.engineLocalAsm
                            : t.engineLocalWasm}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleExecuteStockfishAutoUpdate()}
                      disabled={!isOnline || isAutoUpdating}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {isAutoUpdating ? (
                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      )}
                      <span>
                        {isAutoUpdating
                          ? t.updatingStockfishBtn
                          : t.autoUpdateStockfishBtn}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onVerifyLocalEngine}
                      disabled={isVerifyingEngine}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {isVerifyingEngine ? (
                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      )}
                      <span>
                        {isVerifyingEngine
                          ? t.verifyingLocalEngineBtn
                          : t.verifyLocalEngineBtn}
                      </span>
                    </button>

                    <a
                      href={versionInfo?.officialReleaseUrl || 'https://stockfishchess.org'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-semibold text-white bg-slate-800/85 hover:bg-slate-700 border border-slate-500/60 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>{t.stockfishWebsiteBtn}</span>
                      <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300" />
                    </a>
                  </div>
                </div>

                {versionInfo && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 font-mono"
                    dir="ltr"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      <span>
                        {t.stockfishInstalledBadge(
                          versionInfo.installedVersion,
                          versionInfo.officialReleaseTag
                        )}
                      </span>
                    </span>
                    {versionInfo.updateAvailable && versionInfo.latestWasmVersion && (
                      <span className="text-amber-300 font-semibold">
                        {t.stockfishUpdateAvailableBadge(versionInfo.latestWasmVersion)}
                      </span>
                    )}
                  </div>
                )}

                {autoUpdateNotice && (
                  <div
                    className={`flex items-start gap-1.5 rounded px-2 py-1.5 text-[11px] sm:text-xs font-medium border ${
                      autoUpdateNotice.ok
                        ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-100'
                        : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                    }`}
                  >
                    {autoUpdateNotice.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
                    )}
                    <span>{autoUpdateNotice.text}</span>
                  </div>
                )}

                {localEngineVerify && (
                  <div
                    className={`flex flex-wrap items-center gap-1.5 rounded px-2 py-1 text-[11px] sm:text-xs font-medium border ${
                      localEngineVerify.ok
                        ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                        : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                    }`}
                  >
                    {localEngineVerify.ok ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span>
                          {t.localEngineVerifiedOk(
                            localEngineVerify.backend === 'asm' ? 'ASM.js' : 'WebAssembly',
                            localEngineVerify.bestMove ?? '—',
                            localEngineVerify.latencyMs
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                        <span>
                          {t.localEngineVerifyFailed(localEngineVerify.error ?? 'Error')}
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-700/70 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-200">
                    <Globe
                      className={`w-3.5 h-3.5 shrink-0 ${
                        remoteServerStatus === 'connected'
                          ? 'text-emerald-300'
                          : 'text-slate-400'
                      }`}
                    />
                    <span>
                      {remoteServerStatus === 'connected'
                        ? t.externalVisionConnectedBadge
                        : t.externalServerBtn}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isOnline && (
                      <button
                        type="button"
                        onClick={onReconnectServer}
                        disabled={remoteServerStatus === 'checking'}
                        title={t.checkServerTooltip}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-slate-100 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-500/60 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw
                          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300 ${
                            remoteServerStatus === 'checking' ? 'animate-spin' : ''
                          }`}
                        />
                        <span>
                          {remoteServerStatus === 'checking'
                            ? t.checkingServer
                            : t.checkServer}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowServerConfig((v) => !v)}
                      className="px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-cyan-200 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {showServerConfig ? t.hideUrl : t.externalServerBtn}
                    </button>
                  </div>
                </div>

                {showServerConfig && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSaveExternalServerUrl(serverUrlDraft);
                      onSaveExternalServerId(serverIdDraft);
                    }}
                    className="pt-2 border-t border-slate-700/70 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="url"
                        dir="ltr"
                        value={serverUrlDraft}
                        onChange={(e) => setServerUrlDraft(e.target.value)}
                        placeholder={t.serverUrlPlaceholder}
                        className="flex-1 min-w-[180px] bg-[#05080E] border border-slate-500/70 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded transition-colors shrink-0"
                      >
                        {t.saveAndConnect}
                      </button>
                      {(externalServerUrl ||
                        (externalServerId &&
                          externalServerId !== DEFAULT_EXTERNAL_SERVER_ID)) && (
                        <button
                          type="button"
                          onClick={() => {
                            setServerUrlDraft('');
                            setServerIdDraft(DEFAULT_EXTERNAL_SERVER_ID);
                            onSaveExternalServerUrl('');
                            onSaveExternalServerId(DEFAULT_EXTERNAL_SERVER_ID);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-500/60 rounded transition-colors shrink-0"
                        >
                          {t.defaultServerBtn}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="portal-external-server-id-input"
                        className="text-[11px] sm:text-xs font-semibold text-slate-200 whitespace-nowrap"
                      >
                        {t.externalServerIdLabel}
                      </label>
                      <input
                        id="portal-external-server-id-input"
                        type="text"
                        dir="ltr"
                        value={serverIdDraft}
                        onChange={(e) => setServerIdDraft(e.target.value)}
                        placeholder={t.externalServerIdPlaceholder}
                        className="flex-1 min-w-[160px] bg-[#05080E] border border-slate-500/70 rounded px-3 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {t.serverHelpText}
                    </p>
                  </form>
                )}
              </div>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
