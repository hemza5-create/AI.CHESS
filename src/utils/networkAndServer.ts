/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import { useEffect, useState } from 'react';
import { createAttestedChallenge } from '../security/antiReverseGuard.ts';
import type { ClientPlatform } from '../types/onlineChess.ts';

const EXTERNAL_SERVER_STORAGE_KEY = 'chess_vision_external_server_url';
const EXTERNAL_SERVER_ID_STORAGE_KEY = 'chess_vision_external_server_id';
const VISION_API_STORAGE_KEY = 'chess_vision_board_api_url';
const API_ROUTES_STORAGE_KEY = 'chess_vision_api_routes_v2';

export const APP_VERSION = '1.1.0';
export const DEFAULT_EXTERNAL_SERVER_ID = 'cvsu-uci-core-v2';

export type RemoteServerStatus =
  | 'checking'
  | 'connected'
  | 'offline'
  | 'unreachable'
  | 'unconfigured';

export type ActiveEngineSource = 'local-wasm' | 'local-asm';

export function isCapacitorNativeRuntime(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function detectClientPlatform(): ClientPlatform {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor;
  const capPlatform = cap?.getPlatform?.();
  if (cap?.isNativePlatform?.()) {
    if (capPlatform === 'ios') return 'ios';
    if (capPlatform === 'android') return 'android';
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return 'pwa';
  }

  if (/Electron|Windows NT|Macintosh|X11|Linux x86_64/i.test(ua)) {
    return 'desktop';
  }

  return 'web';
}

export function normalizeServerBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return trimmed.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function normalizeVisionEndpointValue(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '') || '/';
  }
  return normalizeServerBaseUrl(trimmed);
}

export function getStoredExternalServerUrl(): string {
  try {
    const saved = globalThis.localStorage?.getItem(EXTERNAL_SERVER_STORAGE_KEY);
    if (saved && saved.trim()) {
      const normalized = normalizeServerBaseUrl(saved);
      if (normalized) return normalized;
      globalThis.localStorage?.removeItem(EXTERNAL_SERVER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  const envUrl =
    (import.meta.env?.VITE_EXTERNAL_SERVER_URL as string | undefined) ?? '';
  return normalizeServerBaseUrl(envUrl);
}

export function saveExternalServerUrl(rawUrl: string): string {
  const normalized = normalizeServerBaseUrl(rawUrl);
  try {
    if (normalized) {
      globalThis.localStorage?.setItem(EXTERNAL_SERVER_STORAGE_KEY, normalized);
    } else {
      globalThis.localStorage?.removeItem(EXTERNAL_SERVER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return normalized;
}

export function getStoredVisionApiUrl(): string {
  try {
    const saved = globalThis.localStorage?.getItem(VISION_API_STORAGE_KEY);
    if (saved && saved.trim()) {
      const normalized = normalizeVisionEndpointValue(saved);
      if (normalized) return normalized;
      globalThis.localStorage?.removeItem(VISION_API_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  const envUrl =
    (import.meta.env?.VITE_VISION_API_URL as string | undefined) ?? '';
  return normalizeVisionEndpointValue(envUrl);
}

export function saveVisionApiUrl(rawUrl: string): string {
  const normalized = normalizeVisionEndpointValue(rawUrl);
  try {
    if (normalized) {
      globalThis.localStorage?.setItem(VISION_API_STORAGE_KEY, normalized);
    } else {
      globalThis.localStorage?.removeItem(VISION_API_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return normalized;
}

export function buildApiUrl(apiPath: string, externalServerUrl?: string): string | null {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const resolvedBase = normalizeServerBaseUrl(externalServerUrl ?? getStoredExternalServerUrl());

  if (resolvedBase) {
    return `${resolvedBase}${normalizedPath}`;
  }

  // Native Capacitor APK serves local assets on https://localhost where /api/* does not exist unless an external URL is set
  if (isCapacitorNativeRuntime()) {
    return null;
  }

  // Same-origin web browser / PWA server
  return normalizedPath;
}

export function buildWebSocketUrl(wsPath: string, externalServerUrl?: string): string | null {
  const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
  const resolvedBase = normalizeServerBaseUrl(externalServerUrl ?? getStoredExternalServerUrl());

  if (resolvedBase) {
    try {
      const parsed = new URL(resolvedBase);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}${normalizedPath}`;
    } catch {
      return null;
    }
  }

  if (isCapacitorNativeRuntime()) {
    return null;
  }

  if (typeof window !== 'undefined' && window.location?.host) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}${normalizedPath}`;
  }

  return null;
}

export function normalizeServerId(rawId: string): string {
  const cleaned = rawId.trim().replace(/[^a-zA-Z0-9._-]/g, '');
  return cleaned.slice(0, 64);
}

function isLegacyInvalidServerId(id: string): boolean {
  if (!id) return false;
  if (/^srv_key_[0-9a-f]+$/i.test(id)) return true;
  // Decode legacy retired ID without embedding it literally in dist bundles
  return id === ['ebd12', 'cc856'].join('-');
}

export function getStoredExternalServerId(): string {
  try {
    const saved = globalThis.localStorage?.getItem(EXTERNAL_SERVER_ID_STORAGE_KEY);
    if (saved && saved.trim()) {
      const cleaned = normalizeServerId(saved);
      if (cleaned && !isLegacyInvalidServerId(cleaned)) {
        return cleaned;
      }
      globalThis.localStorage?.removeItem(EXTERNAL_SERVER_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  const envId = normalizeServerId(
    (import.meta.env?.VITE_EXTERNAL_SERVER_ID as string | undefined) ?? ''
  );
  if (envId && !isLegacyInvalidServerId(envId)) {
    return envId;
  }
  return DEFAULT_EXTERNAL_SERVER_ID;
}

export function saveExternalServerId(rawId: string): string {
  const normalized = normalizeServerId(rawId);
  invalidateClientTokenCache();
  try {
    if (normalized) {
      globalThis.localStorage?.setItem(EXTERNAL_SERVER_ID_STORAGE_KEY, normalized);
    } else {
      globalThis.localStorage?.removeItem(EXTERNAL_SERVER_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return normalized || getStoredExternalServerId();
}

function normalizeRoutePath(rawPath: string | undefined, fallback: string): string {
  if (!rawPath || typeof rawPath !== 'string') return fallback;
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (/\/gemini\//i.test(trimmed) || /^\/api\/v2\/tt$/i.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function readStoredRouteOverrides(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(API_ROUTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getConfiguredApiRoutes() {
  const overrides = readStoredRouteOverrides();
  return {
    boardScan: normalizeRoutePath(
      overrides.boardScan ?? (import.meta.env?.VITE_API_ROUTE_BOARD_SCAN as string | undefined),
      '/api/v2/vision/scan-board'
    ),
    explain: normalizeRoutePath(
      overrides.explain ?? (import.meta.env?.VITE_API_ROUTE_EXPLAIN as string | undefined),
      '/api/v2/coach/explain'
    ),
    tts: normalizeRoutePath(
      overrides.tts ?? (import.meta.env?.VITE_API_ROUTE_TTS as string | undefined),
      '/api/v2/coach/synthesize'
    ),
    ownership: normalizeRoutePath(
      overrides.ownership ?? (import.meta.env?.VITE_API_ROUTE_OWNERSHIP as string | undefined),
      '/api/v2/vault/ownership'
    ),
    engineHealth: normalizeRoutePath(
      overrides.engineHealth ?? (import.meta.env?.VITE_API_ROUTE_ENGINE_HEALTH as string | undefined),
      '/api/v2/engine/health'
    ),
    engineVersion: normalizeRoutePath(
      overrides.engineVersion ?? (import.meta.env?.VITE_API_ROUTE_ENGINE_VERSION as string | undefined),
      '/api/v2/engine/version'
    ),
    engineAutoUpdate: normalizeRoutePath(
      overrides.engineAutoUpdate ?? (import.meta.env?.VITE_API_ROUTE_ENGINE_AUTO_UPDATE as string | undefined),
      '/api/v2/engine/auto-update'
    ),
    vaultPublicKeys: '/api/v2/vault/public-keys',
    vaultAuthStatus: '/api/v2/vault/auth-status',
    vaultAdminClaim: '/api/v2/vault/admin/claim',
    vaultAdminLogin: '/api/v2/vault/admin/login',
    vaultAdminLogout: '/api/v2/vault/admin/logout',
    vaultIssueToken: '/api/v2/vault/issue-token',
    vaultVerify: '/api/v2/vault/verify',
    vaultRotate: '/api/v2/vault/rotate',
    vaultPolicy: '/api/v2/vault/policy',
    onlineBootstrap: '/api/v2/online/bootstrap',
    onlineProfile: '/api/v2/online/profile',
  } as const;
}

export const API_ROUTES = getConfiguredApiRoutes();

// Ephemeral in-memory Ed25519 client token cache (never written to localStorage/sessionStorage)
let cachedClientSession: {
  token: string;
  expiresAtMs: number;
  serverBase: string;
  serverId: string;
} | null = null;
let inflightTokenPromise: Promise<string | null> | null = null;

export function invalidateClientTokenCache(): void {
  cachedClientSession = null;
  inflightTokenPromise = null;
}

export function getServerIdHeaders(externalServerId?: string): Record<string, string> {
  const serverId = normalizeServerId(externalServerId ?? getStoredExternalServerId()) || DEFAULT_EXTERNAL_SERVER_ID;
  return {
    'X-ChessVision-Server-Id': serverId,
  };
}

export async function getAuthorizedClientHeaders(
  externalServerUrl?: string,
  externalServerId?: string
): Promise<Record<string, string>> {
  const serverBase = normalizeServerBaseUrl(externalServerUrl ?? getStoredExternalServerUrl());
  const serverId =
    normalizeServerId(externalServerId ?? getStoredExternalServerId()) ||
    DEFAULT_EXTERNAL_SERVER_ID;

  const baseHeaders: Record<string, string> = {
    'X-ChessVision-Server-Id': serverId,
  };

  const now = Date.now();
  if (
    cachedClientSession &&
    cachedClientSession.serverBase === serverBase &&
    cachedClientSession.serverId === serverId &&
    cachedClientSession.expiresAtMs - now > 30_000
  ) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${cachedClientSession.token}`,
    };
  }

  const issueUrl = buildApiUrl(getConfiguredApiRoutes().vaultIssueToken, serverBase);
  if (!issueUrl) {
    return baseHeaders;
  }

  if (!inflightTokenPromise) {
    inflightTokenPromise = (async () => {
      try {
        const challenge = await createAttestedChallenge();
        const res = await fetch(issueUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ChessVision-Server-Id': serverId,
          },
          body: JSON.stringify({
            subject: `client:${serverId}`,
            scope: 'engine:verified',
            ttlSeconds: 300,
            nonce: challenge.nonce,
            timestamp: challenge.timestamp,
            clientPublicJwk: challenge.clientPublicJwk,
            clientProofB64Url: challenge.clientProofB64Url,
          }),
        });
        const parsed = await safeParseJsonBody<{ token?: string; expiresAt?: number }>(res);
        if (parsed.ok && parsed.data?.token) {
          const expiresAtMs =
            typeof parsed.data.expiresAt === 'number'
              ? parsed.data.expiresAt
              : Date.now() + 270_000;
          cachedClientSession = {
            token: parsed.data.token,
            expiresAtMs,
            serverBase,
            serverId,
          };
          return parsed.data.token;
        }
        return null;
      } catch {
        return null;
      } finally {
        inflightTokenPromise = null;
      }
    })();
  }

  const token = await inflightTokenPromise;
  if (token) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${token}`,
    };
  }
  return baseHeaders;
}

/**
 * Resolves the API endpoint URL for sending chessboard snapshots.
 * Accepts either a full endpoint URL (e.g., https://api.example.com/v2/scan-board)
 * or a base server URL (e.g., https://api.example.com -> appends configured boardScan route),
 * falling back to externalServerUrl or same-origin configurable boardScan route.
 */
export function resolveVisionSnapshotUrl(
  visionApiUrl?: string,
  externalServerUrl?: string
): string | null {
  const rawVision = normalizeServerBaseUrl(visionApiUrl ?? getStoredVisionApiUrl());
  const boardScanRoute = getConfiguredApiRoutes().boardScan;

  if (rawVision) {
    if (/^https?:\/\//i.test(rawVision)) {
      try {
        const parsed = new URL(rawVision);
        if (!parsed.pathname || parsed.pathname === '/') {
          return `${parsed.origin}${boardScanRoute}`;
        }
        return rawVision;
      } catch {
        return rawVision;
      }
    }
    return buildApiUrl(rawVision, externalServerUrl);
  }

  return buildApiUrl(boardScanRoute, externalServerUrl);
}

export interface SafeJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  isEmpty: boolean;
  isHtmlFallback: boolean;
}

export async function safeParseJsonBody<T>(
  res: Response,
  fallbackError = 'Server request failed'
): Promise<SafeJsonResult<T>> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `${fallbackError} (HTTP ${res.status || 0})`,
      isEmpty: true,
      isHtmlFallback: false,
    };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `استجابة فارغة من الخادم (HTTP ${res.status}) — تأكد من تشغيل الخادم الخلفي أو صحة الرابط.`,
      isEmpty: true,
      isHtmlFallback: false,
    };
  }

  const isHtml = trimmed.startsWith('<');
  try {
    const parsed = JSON.parse(trimmed) as T;
    if (!res.ok) {
      const serverErr =
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `${fallbackError} (HTTP ${res.status})`;
      return {
        ok: false,
        status: res.status,
        data: parsed,
        error: serverErr,
        isEmpty: false,
        isHtmlFallback: false,
      };
    }
    return {
      ok: true,
      status: res.status,
      data: parsed,
      error: null,
      isEmpty: false,
      isHtmlFallback: false,
    };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: isHtml
        ? `الخادم أعاد صفحة HTML بدلاً من JSON (HTTP ${res.status}) — تحقق من تشغيل خادم API الخلفي.`
        : `رد الخادم ليس بصيغة JSON صالحة (HTTP ${res.status}).`,
      isEmpty: false,
      isHtmlFallback: isHtml,
    };
  }
}

export async function checkRemoteServerHealth(
  externalServerUrl?: string,
  timeoutMs = 3500,
  externalServerId?: string
): Promise<{ reachable: boolean; status: RemoteServerStatus; engine?: string; serverId?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { reachable: false, status: 'offline' };
  }

  const healthUrl = buildApiUrl(getConfiguredApiRoutes().engineHealth, externalServerUrl);
  if (!healthUrl) {
    return { reachable: false, status: 'unconfigured' };
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: getServerIdHeaders(externalServerId),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { reachable: false, status: 'unreachable' };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { reachable: false, status: 'unreachable' };
    }
    const parsed = await safeParseJsonBody<{ ok?: unknown; engine?: unknown; serverId?: unknown }>(res);
    if (parsed.ok && parsed.data && parsed.data.ok === true) {
      return {
        reachable: true,
        status: 'connected',
        engine: typeof parsed.data.engine === 'string' ? parsed.data.engine : undefined,
        serverId: typeof parsed.data.serverId === 'string' ? parsed.data.serverId : undefined,
      };
    }
    return { reachable: false, status: 'unreachable' };
  } catch {
    return { reachable: false, status: 'unreachable' };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);

    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
