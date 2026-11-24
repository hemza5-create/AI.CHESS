import { useEffect, useState } from 'react';

const EXTERNAL_SERVER_STORAGE_KEY = 'chess_vision_external_server_url';
const VISION_API_STORAGE_KEY = 'chess_vision_board_api_url';

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

export function normalizeServerBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function getStoredExternalServerUrl(): string {
  try {
    const saved = globalThis.localStorage?.getItem(EXTERNAL_SERVER_STORAGE_KEY);
    if (saved && saved.trim()) {
      return normalizeServerBaseUrl(saved);
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
      return normalizeServerBaseUrl(saved);
    }
  } catch {
    // Ignore storage access errors
  }
  const envUrl =
    (import.meta.env?.VITE_VISION_API_URL as string | undefined) ?? '';
  return normalizeServerBaseUrl(envUrl);
}

export function saveVisionApiUrl(rawUrl: string): string {
  const normalized = normalizeServerBaseUrl(rawUrl);
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

/**
 * Resolves the API endpoint URL for sending chessboard snapshots.
 * Accepts either a full endpoint URL (e.g., https://api.example.com/v1/board-fen)
 * or a base server URL (e.g., https://api.example.com -> appends /api/gemini/board-fen),
 * falling back to externalServerUrl or same-origin /api/gemini/board-fen.
 */
export function resolveVisionSnapshotUrl(
  visionApiUrl?: string,
  externalServerUrl?: string
): string | null {
  const rawVision = normalizeServerBaseUrl(visionApiUrl ?? getStoredVisionApiUrl());

  if (rawVision) {
    if (/^https?:\/\//i.test(rawVision)) {
      try {
        const parsed = new URL(rawVision);
        if (!parsed.pathname || parsed.pathname === '/') {
          return `${parsed.origin}/api/gemini/board-fen`;
        }
        return rawVision;
      } catch {
        return rawVision;
      }
    }
    return buildApiUrl(rawVision, externalServerUrl);
  }

  return buildApiUrl('/api/gemini/board-fen', externalServerUrl);
}

export async function checkRemoteServerHealth(
  externalServerUrl?: string,
  timeoutMs = 3500
): Promise<{ reachable: boolean; status: RemoteServerStatus; engine?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { reachable: false, status: 'offline' };
  }

  const healthUrl = buildApiUrl('/api/stockfish/health', externalServerUrl);
  if (!healthUrl) {
    return { reachable: false, status: 'unconfigured' };
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { reachable: false, status: 'unreachable' };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { reachable: false, status: 'unreachable' };
    }
    const data = (await res.json()) as { ok?: unknown; engine?: unknown };
    if (data && data.ok === true) {
      return {
        reachable: true,
        status: 'connected',
        engine: typeof data.engine === 'string' ? data.engine : undefined,
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
