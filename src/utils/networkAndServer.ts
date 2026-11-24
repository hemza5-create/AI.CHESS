import { useEffect, useState } from 'react';

const EXTERNAL_SERVER_STORAGE_KEY = 'chess_vision_external_server_url';

export type RemoteServerStatus =
  | 'checking'
  | 'connected'
  | 'offline'
  | 'unreachable'
  | 'unconfigured';

export type ActiveEngineSource = 'remote' | 'local-wasm' | 'local-asm';

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
