import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Terminal,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Play,
  Square,
  Loader2,
  Power,
  Cpu,
  Globe,
  WifiOff,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Download,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import type {
  MoveRecord,
  StockfishAnalysisResult,
  TtsVoiceName,
} from '../types/chess.ts';
import {
  localStockfishEngine,
  type LocalEngineVerificationResult,
} from '../engine/localStockfishEngine.ts';
import {
  buildApiUrl,
  type ActiveEngineSource,
  type RemoteServerStatus,
} from '../utils/networkAndServer.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { getLocalizedGameOverReason } from '../i18n/translations.ts';

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

interface AnalysisAndVoicePanelProps {
  analysis: StockfishAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  isOnline: boolean;
  activeEngineSource: ActiveEngineSource;
  localEngineVerify: LocalEngineVerificationResult | null;
  isVerifyingEngine: boolean;
  onVerifyLocalEngine: () => void;
  remoteServerStatus: RemoteServerStatus;
  externalServerUrl: string;
  onSaveExternalServerUrl: (url: string) => void;
  onReconnectServer: () => void;
  searchDepth: number;
  playerElo: number;
  autoDepthByElo: boolean;
  onChangeSearchDepth: (depth: number) => void;
  onRestoreAutoDepth: () => void;
  voiceCoachEnabled: boolean;
  onToggleVoiceCoach: () => void;
  explanationText: string | null;
  isGeneratingExplanation: boolean;
  isSynthesizingAudio: boolean;
  isPlayingAudio: boolean;
  voiceError: string | null;
  autoSpeak: boolean;
  selectedVoice: TtsVoiceName;
  hasAudioReady: boolean;
  moveHistory: MoveRecord[];
  onToggleAutoSpeak: () => void;
  onSelectVoice: (voice: TtsVoiceName) => void;
  onGenerateAndSpeak: () => void;
  onReplayOrStopAudio: () => void;
  onApplyPvMove: (uci: string) => void;
  onEngineAutoUpdated?: () => void;
}

const VOICE_KEYS: TtsVoiceName[] = ['Kore', 'Charon', 'Fenrir', 'Zephyr', 'Puck'];

export const AnalysisAndVoicePanel: React.FC<AnalysisAndVoicePanelProps> = ({
  analysis,
  isAnalyzing,
  analysisError,
  isOnline,
  activeEngineSource,
  localEngineVerify,
  isVerifyingEngine,
  onVerifyLocalEngine,
  remoteServerStatus,
  externalServerUrl,
  onSaveExternalServerUrl,
  onReconnectServer,
  searchDepth,
  playerElo,
  autoDepthByElo,
  onChangeSearchDepth,
  onRestoreAutoDepth,
  voiceCoachEnabled,
  onToggleVoiceCoach,
  explanationText,
  isGeneratingExplanation,
  isSynthesizingAudio,
  isPlayingAudio,
  voiceError,
  autoSpeak,
  selectedVoice,
  hasAudioReady,
  moveHistory,
  onToggleAutoSpeak,
  onSelectVoice,
  onGenerateAndSpeak,
  onReplayOrStopAudio,
  onApplyPvMove,
  onEngineAutoUpdated,
}) => {
  const { language, t } = useLanguage();
  const [showUciLog, setShowUciLog] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState(externalServerUrl);

  const [versionInfo, setVersionInfo] = useState<StockfishVersionInfo | null>(null);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [autoUpdateNotice, setAutoUpdateNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  // Session admin token held strictly in React state memory (never localStorage)
  const [adminToken, setAdminToken] = useState<string>('');
  const [authPromptMode, setAuthPromptMode] = useState<'claim' | 'login' | null>(null);
  const [passcodeDraft, setPasscodeDraft] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  const resolvedGameOverReason = analysis?.gameOverKey
    ? getLocalizedGameOverReason(language, analysis.gameOverKey)
    : analysis?.gameOverReason ?? null;

  React.useEffect(() => {
    setServerUrlDraft(externalServerUrl);
  }, [externalServerUrl]);

  const fetchOfficialVersionStatus = React.useCallback(async () => {
    if (!isOnline) return;
    const url = buildApiUrl('/api/stockfish/version', externalServerUrl) ?? '/api/stockfish/version';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as StockfishVersionInfo;
      if (data && typeof data.installedVersion === 'string') {
        setVersionInfo(data);
      }
    } catch {
      // ignore offline or unreachable transient check errors
    }
  }, [externalServerUrl, isOnline]);

  React.useEffect(() => {
    void fetchOfficialVersionStatus();
  }, [fetchOfficialVersionStatus]);

  const executeAutoUpdate = React.useCallback(
    async (tokenOverride?: string) => {
      const activeToken = tokenOverride ?? adminToken;
      setIsAutoUpdating(true);
      setAutoUpdateNotice(null);

      try {
        const updateUrl =
          buildApiUrl('/api/stockfish/auto-update', externalServerUrl) ??
          '/api/stockfish/auto-update';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (activeToken) {
          headers.Authorization = `Bearer ${activeToken}`;
        }

        const res = await fetch(updateUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          requiresAdminAuth?: boolean;
          authStatus?: { configuredViaEnv?: boolean; claimed?: boolean };
          manifest?: {
            packageVersion: string;
            wasmScript: string;
            asmScript: string | null;
            updatedAt: string;
            files: { name: string }[];
          };
          status?: StockfishVersionInfo;
        };

        if (res.status === 401 && payload.requiresAdminAuth) {
          const needsClaim =
            !payload.authStatus?.configuredViaEnv && !payload.authStatus?.claimed;
          setAuthPromptMode(needsClaim ? 'claim' : 'login');
          setAuthError(null);
          return;
        }

        if (!res.ok || !payload.ok || !payload.manifest) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }

        setAuthPromptMode(null);
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
    },
    [
      adminToken,
      externalServerUrl,
      onEngineAutoUpdated,
      onVerifyLocalEngine,
      t,
    ]
  );

  const handleAuthSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!passcodeDraft.trim() || !authPromptMode) return;
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const endpoint =
          authPromptMode === 'claim'
            ? '/api/security/admin/claim'
            : '/api/security/admin/login';
        const authUrl = buildApiUrl(endpoint, externalServerUrl) ?? endpoint;
        const res = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: passcodeDraft }),
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
        setPasscodeDraft('');
        setAuthPromptMode(null);
        await executeAutoUpdate(data.token);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsAuthenticating(false);
      }
    },
    [authPromptMode, executeAutoUpdate, externalServerUrl, passcodeDraft]
  );

  const scoreTone =
    !analysis
      ? 'text-slate-100'
      : analysis.scoreValue > 35
      ? 'text-emerald-300'
      : analysis.scoreValue < -35
      ? 'text-rose-300'
      : 'text-white';

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* 1. Stockfish UCI Engine Card */}
      <section className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3.5 border-b border-slate-400/35 bg-[#0B0E14]/20">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h2 className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
              {t.engineTitle}
            </h2>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] sm:text-sm font-mono font-semibold text-slate-200" dir="ltr">
              {t.depthShort} {analysis?.appliedDepth ?? analysis?.depthReached ?? searchDepth} · Elo {playerElo}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {!autoDepthByElo && (
              <button
                type="button"
                onClick={onRestoreAutoDepth}
                className="text-[11px] sm:text-sm font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
              >
                {t.autoEloBtn}
              </button>
            )}
            <label htmlFor="depth-range" className="text-[11px] sm:text-sm font-medium text-slate-100 whitespace-nowrap">
              {t.depthSliderLabel}
            </label>
            <input
              id="depth-range"
              type="range"
              min={5}
              max={18}
              step={1}
              value={searchDepth}
              onChange={(e) => onChangeSearchDepth(Number(e.target.value))}
              className="w-16 sm:w-20 cursor-pointer"
            />
            <span className="text-xs sm:text-sm font-mono font-bold text-cyan-200 w-5 sm:w-6 text-center">
              {searchDepth}
            </span>
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Local Stockfish Engine Status, Official Link, Verification & External Vision API Strip */}
          <div className="rounded-lg border border-slate-400/40 bg-[#070B12]/30 px-2.5 sm:px-3.5 py-2 sm:py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-sm font-semibold">
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
                  onClick={() => void executeAutoUpdate()}
                  disabled={!isOnline || isAutoUpdating}
                  className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 text-[11px] sm:text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
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
                  className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 text-[11px] sm:text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
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
                  className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 text-[11px] sm:text-xs font-semibold text-white bg-slate-800/85 hover:bg-slate-700 border border-slate-500/60 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{t.stockfishWebsiteBtn}</span>
                  <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300" />
                </a>
              </div>
            </div>

            {/* Official & Installed Stockfish Version Metadata Row */}
            {versionInfo && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 font-mono" dir="ltr">
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

            {/* Inline Admin Passcode Authorization Prompt (only shown when updating engine files requires session unlock) */}
            {authPromptMode && (
              <form
                onSubmit={(e) => void handleAuthSubmit(e)}
                className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-2.5 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-amber-200">
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {authPromptMode === 'claim'
                      ? t.stockfishAuthClaimTitle
                      : t.stockfishAuthLoginTitle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={passcodeDraft}
                    onChange={(e) => setPasscodeDraft(e.target.value)}
                    placeholder={t.stockfishAuthPasscodePlaceholder}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-950/85 border border-slate-600 rounded text-white focus:outline-none focus:border-cyan-400"
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={isAuthenticating || !passcodeDraft.trim()}
                    className="px-2.5 py-1.5 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 rounded whitespace-nowrap"
                  >
                    {isAuthenticating ? '...' : t.stockfishAuthConfirmBtn}
                  </button>
                </div>
                {authError && (
                  <div className="text-[11px] text-rose-300 font-medium">
                    {authError}
                  </div>
                )}
              </form>
            )}

            {/* Official Stockfish Auto-Update Status Banner */}
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

            {/* Local Stockfish Self-Test Result */}
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

            {/* External API Server Connection Row (for Snapshots & Voice AI) */}
            <div className="pt-1.5 border-t border-slate-600/45 flex flex-wrap items-center justify-between gap-1.5">
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-slate-100 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-500/60 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300 ${
                        remoteServerStatus === 'checking' ? 'animate-spin' : ''
                      }`}
                    />
                    <span>{remoteServerStatus === 'checking' ? t.checkingServer : t.checkServer}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowServerConfig((v) => !v)}
                  className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-cyan-200 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 rounded transition-colors whitespace-nowrap shrink-0"
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
                }}
                className="pt-2 border-t border-slate-600/50 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={serverUrlDraft}
                    onChange={(e) => setServerUrlDraft(e.target.value)}
                    placeholder={t.serverUrlPlaceholder}
                    className="flex-1 min-w-[180px] bg-[#05080E] border border-slate-500/70 rounded px-3 py-1.5 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs sm:text-sm font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded transition-colors shrink-0"
                  >
                    {t.saveAndConnect}
                  </button>
                  {externalServerUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setServerUrlDraft('');
                        onSaveExternalServerUrl('');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-500/60 rounded transition-colors shrink-0"
                    >
                      {t.defaultServerBtn}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {t.serverHelpText}
                </p>
              </form>
            )}
          </div>

          {analysisError && (
            <div className="px-3.5 py-2.5 rounded-lg border border-rose-400/60 bg-rose-950/75 text-sm font-medium text-rose-100">
              {analysisError}
            </div>
          )}

          {/* Primary Evaluation Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 pb-2.5 sm:pb-3.5 border-b border-slate-600/60">
            <div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-200 mb-0.5 sm:mb-1">{t.evaluationLabel}</div>
              <div className={`text-xl sm:text-3xl font-mono font-bold tabular-nums ${scoreTone}`} dir="ltr">
                {isAnalyzing && !analysis ? '...' : analysis?.evaluationLabel ?? '0.00'}
              </div>
            </div>

            <div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-200 mb-0.5 sm:mb-1">{t.bestMoveLabel}</div>
              <div className="text-base sm:text-xl font-mono font-bold text-emerald-300" dir="ltr">
                {analysis?.bestMoveSan ? (
                  <button
                    type="button"
                    onClick={() => analysis.bestMove && onApplyPvMove(analysis.bestMove)}
                    title={t.applyBestMoveTooltip}
                    className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded"
                  >
                    {analysis.bestMoveSan}{' '}
                    <span className="text-[11px] sm:text-sm text-slate-200 font-medium">
                      ({analysis.bestMove})
                    </span>
                  </button>
                ) : (
                  <span className="text-slate-200 text-xs sm:text-base">
                    {resolvedGameOverReason ?? '—'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-[11px] sm:text-sm font-medium text-slate-200 mb-0.5 sm:mb-1">{t.searchSpeedLabel}</div>
              <div className="text-xs sm:text-base font-mono font-semibold text-white tabular-nums" dir="ltr">
                {analysis
                  ? `${(analysis.nps / 1000).toFixed(0)}k n/s · ${analysis.timeMs}ms`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Top 3 MultiPV Lines */}
          <div>
            <div className="text-[11px] sm:text-sm font-semibold text-slate-100 mb-1.5 sm:mb-2">{t.topLinesTitle}</div>
            {analysis && analysis.lines.length > 0 ? (
              <div className="divide-y divide-slate-500/40 border border-slate-400/40 rounded-lg bg-[#070B12]/30">
                {analysis.lines.map((line) => {
                  const scoreStr =
                    line.scoreType === 'mate'
                      ? `${line.scoreValue > 0 ? '+' : '-'}M${Math.abs(line.scoreValue)}`
                      : `${line.scoreValue >= 0 ? '+' : ''}${(line.scoreValue / 100).toFixed(2)}`;
                  return (
                    <div
                      key={line.multipv}
                      className="flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-1.5 sm:py-2.5 text-[11px] sm:text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0" dir="ltr">
                        <span className="font-mono font-semibold text-slate-300 w-5">#{line.multipv}</span>
                        <span
                          className={`font-mono font-bold w-16 text-right tabular-nums ${
                            line.scoreValue > 30
                              ? 'text-emerald-300'
                              : line.scoreValue < -30
                              ? 'text-rose-300'
                              : 'text-white'
                          }`}
                        >
                          {scoreStr}
                        </span>
                        <span className="font-mono font-medium text-slate-100 truncate">
                          {line.pvSan.join(' ')}
                        </span>
                      </div>

                      {line.pvUci[0] && (
                        <button
                          type="button"
                          onClick={() => onApplyPvMove(line.pvUci[0])}
                          className="text-xs sm:text-sm font-bold text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
                        >
                          {t.applyLineBtn}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-slate-200 py-2">
                {analysis?.isGameOver
                  ? resolvedGameOverReason
                  : t.emptyAnalysisHint}
              </div>
            )}
          </div>

          {/* Expandable UCI Protocol Terminal */}
          <div>
            <button
              type="button"
              onClick={() => setShowUciLog((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 sm:px-3.5 sm:py-2.5 text-[11px] sm:text-sm font-semibold text-white bg-[#070B12]/35 hover:bg-[#070B12]/55 border border-slate-400/45 rounded-lg transition-colors"
            >
              <span className="inline-flex items-center gap-1.5 sm:gap-2">
                <Terminal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
                <span>{t.uciLogTitle}</span>
              </span>
              {showUciLog ? (
                <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>

            {showUciLog && (
              <pre
                dir="ltr"
                className="mt-2 p-2.5 sm:p-3.5 rounded-lg bg-[#060910]/55 border border-slate-400/45 text-[11px] sm:text-sm font-mono text-white overflow-x-auto max-h-40 sm:max-h-48 overflow-y-auto leading-relaxed"
              >
                {analysis?.uciLog?.length
                  ? analysis.uciLog.join('\n')
                  : '> uci\n< uciok\n< readyok'}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* 2. Gemini LLM Explanation & Spoken Multilingual Commentary (On-Demand Toggle) */}
      <section className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 border-b border-slate-400/35 bg-[#0B0E14]/20">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <MessageSquareText
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${voiceCoachEnabled ? 'text-cyan-300' : 'text-slate-200'}`}
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
                {t.voiceCoachTitle}
              </h2>
              {!voiceCoachEnabled && (
                <p className="text-[11px] sm:text-sm text-slate-200 truncate">
                  {t.voiceCoachStoppedHint}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {voiceCoachEnabled && (
              <>
                <button
                  type="button"
                  onClick={onToggleAutoSpeak}
                  className={`inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    autoSpeak
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-500/70 bg-slate-900/60 text-slate-100 hover:text-white'
                  }`}
                >
                  {autoSpeak ? (
                    <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  <span>{t.autoSpeakBtn}</span>
                </button>

                <select
                  aria-label={t.voiceSelectAria}
                  value={selectedVoice}
                  onChange={(e) => onSelectVoice(e.target.value as TtsVoiceName)}
                  className="bg-[#070B12] border border-slate-500/70 rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-medium text-white focus:outline-none focus:border-cyan-400"
                >
                  {VOICE_KEYS.map((voiceKey) => (
                    <option key={voiceKey} value={voiceKey}>
                      {t.voiceLabels[voiceKey]}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button
              type="button"
              onClick={onToggleVoiceCoach}
              className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-sm font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                voiceCoachEnabled
                  ? 'bg-slate-800 hover:bg-rose-600/25 text-white hover:text-rose-200 border border-slate-500 hover:border-rose-400/60'
                  : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
              }`}
            >
              <Power className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{voiceCoachEnabled ? t.powerOff : t.powerOn}</span>
            </button>
          </div>
        </div>

        {voiceCoachEnabled && (
          <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            {voiceError && (
              <div className="px-3.5 py-2.5 rounded-lg border border-rose-400/60 bg-rose-950/75 text-sm font-medium text-rose-100">
                {voiceError}
              </div>
            )}

            <div className="min-h-[72px] sm:min-h-[92px] p-2.5 sm:p-3.5 rounded-lg bg-[#070B12]/35 border border-slate-400/45 text-xs sm:text-base leading-relaxed text-white">
              {isGeneratingExplanation ? (
                <span className="inline-flex items-center gap-2 text-slate-100 text-xs sm:text-sm">
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-cyan-300" />
                  <span>{t.generatingExplanation}</span>
                </span>
              ) : explanationText ? (
                explanationText
              ) : (
                <span className="text-slate-100 text-[11px] sm:text-sm">
                  {t.voiceCoachEmptyText}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onGenerateAndSpeak}
                disabled={isGeneratingExplanation || isSynthesizingAudio || !analysis}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-sm font-bold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:pointer-events-none text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {isGeneratingExplanation || isSynthesizingAudio ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span>
                  {isSynthesizingAudio
                    ? t.synthesizingAudioBtn
                    : t.explainAndSpeakBtn}
                </span>
              </button>

              {hasAudioReady && (
                <button
                  type="button"
                  onClick={onReplayOrStopAudio}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-sm font-semibold text-white bg-slate-800/75 hover:bg-slate-700 border border-slate-400/50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlayingAudio ? (
                    <>
                      <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-300" />
                      <span>{t.stopAudioBtn}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300" />
                      <span>{t.replayAudioBtn}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. Detected Move Log */}
      <section className="border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-400/35 bg-[#0B0E14]/20">
          <h3 className="text-xs sm:text-base font-bold text-white">{t.moveLogTitle}</h3>
          <span className="text-[11px] sm:text-sm font-mono font-semibold text-slate-100">
            {t.moveCount(moveHistory.length)}
          </span>
        </div>

        <div className="max-h-40 sm:max-h-48 overflow-y-auto divide-y divide-slate-500/40 bg-[#070B12]/30">
          {moveHistory.length === 0 ? (
            <div className="px-3 sm:px-4 py-3 sm:py-4 text-[11px] sm:text-sm text-slate-200 text-center">
              {t.emptyMoveLog}
            </div>
          ) : (
            moveHistory.map((m) => (
              <div
                key={`${m.ply}-${m.uci}`}
                className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-sm hover:bg-slate-800/45"
              >
                <div className="flex items-center gap-3" dir="ltr">
                  <span className="font-mono font-semibold text-slate-300 w-7">
                    {Math.ceil(m.ply / 2)}.{m.ply % 2 === 1 ? '' : '..'}
                  </span>
                  <span className="font-mono font-bold text-white">{m.san}</span>
                  <span className="font-mono text-slate-200">{m.uci}</span>
                </div>
                <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-200">
                  <span>
                    {m.source === 'vision'
                      ? t.sourceTagVision
                      : m.source === 'virtual'
                      ? t.sourceTagVirtual
                      : t.sourceTagManual}
                  </span>
                  <span className="font-mono font-semibold text-white" dir="ltr">
                    {m.evaluationLabel ?? '—'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
