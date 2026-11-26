/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Chess } from 'chess.js';
import { Trash2, Loader2, WifiOff, Eye, GraduationCap, Puzzle, ShieldCheck, Lock, Unlock } from 'lucide-react';
import { LiveVisionStage } from './components/LiveVisionStage.tsx';
import { DigitalBoard } from './components/DigitalBoard.tsx';
import { CapturePreviewPanel } from './components/CapturePreviewPanel.tsx';
import { AnalysisAndVoicePanel } from './components/AnalysisAndVoicePanel.tsx';
import { ResourceTradeoffConsole } from './components/ResourceTradeoffConsole.tsx';
import { InteractiveCoachTab } from './components/InteractiveCoachTab.tsx';
import {
  PuzzlesTab,
  SOLVED_PUZZLES_STORAGE_KEY,
  CURRENT_PUZZLE_STORAGE_KEY,
} from './components/PuzzlesTab.tsx';
import { SecurityKeyVaultTab } from './components/SecurityKeyVaultTab.tsx';
import { DeveloperPortalModal } from './components/DeveloperPortalModal.tsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.tsx';
import { saveStoredLanguage, useLanguage } from './i18n/LanguageContext.tsx';
import type { TranslationDictionary } from './i18n/translations.ts';
import { OpenCvChessPipeline, computeFitRoi } from './vision/opencvPipeline.ts';
import {
  analyzeBoardMatrixPerspective,
  rowsToBoardMatrix,
  type BoardMatrix8x8,
} from './vision/boardMatrix.ts';
import { renderVirtualBoardToCanvas, SAMPLE_GAMES } from './vision/virtualBoardRenderer.ts';
import { playMoveTapSound, unlockAudioContext } from './utils/soundEffects.ts';
import {
  localStockfishEngine,
  type LocalEngineVerificationResult,
} from './engine/localStockfishEngine.ts';
import {
  API_ROUTES,
  buildApiUrl,
  checkRemoteServerHealth,
  getAuthorizedClientHeaders,
  getStoredExternalServerId,
  getStoredExternalServerUrl,
  getStoredVisionApiUrl,
  isCapacitorNativeRuntime,
  resolveVisionSnapshotUrl,
  saveExternalServerId,
  saveExternalServerUrl,
  saveVisionApiUrl,
  useOnlineStatus,
  type ActiveEngineSource,
  type RemoteServerStatus,
} from './utils/networkAndServer.ts';
import type {
  CapturedBoardPreview,
  CaptureSource,
  FrameTelemetry,
  MoveRecord,
  RoiQuad,
  SquareMetric,
  StockfishAnalysisResult,
  TtsVoiceName,
  VisionConfig,
  VisionViewMode,
} from './types/chess.ts';

const DEFAULT_VIRTUAL_ROI: RoiQuad = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

async function parseJsonResponse<T>(
  res: Response,
  fallbackError: string,
  t: TranslationDictionary
): Promise<T> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error(t.emptyServerResponse(fallbackError, res.status));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    if (isCapacitorNativeRuntime() || rawText.trimStart().startsWith('<')) {
      throw new Error(t.cloudFeatureRequiresServer);
    }
    throw new Error(t.invalidServerJson(res.status));
  }
  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : fallbackError;
    throw new Error(errMsg);
  }
  return parsed as T;
}

export default function App() {
  const { language, meta, t } = useLanguage();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'analyzer' | 'coach' | 'puzzles' | 'keyVault'>('analyzer');
  const [source, setSource] = useState<CaptureSource>('virtual');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<VisionViewMode>('original');
  const [roi, setRoi] = useState<RoiQuad>(DEFAULT_VIRTUAL_ROI);

  const [config, setConfig] = useState<VisionConfig>({
    resolution: 512,
    targetFps: 60,
    cannyThreshold: 75,
    motionThreshold: 14,
    blurEnabled: true,
    orientation: 'white',
  });

  // Synchronized Chess State (driven by OpenCV detection or manual clicks)
  const chessRef = useRef<Chess>(new Chess());
  const [fen, setFen] = useState<string>(chessRef.current.fen());
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
    san: string;
    uci: string;
    source: 'vision' | 'manual' | 'virtual';
    detectedAt: number;
  } | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);

  // Virtual Stream Source State (independent scene rendered to virtualCanvasRef)
  const virtualChessRef = useRef<Chess>(new Chess());
  const [virtualLastMove, setVirtualLastMove] = useState<{ from: string; to: string } | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SAMPLE_GAMES[0].id);
  const [presetStepIndex, setPresetStepIndex] = useState<number>(0);
  const [simulateLightingNoise, setSimulateLightingNoise] = useState<boolean>(false);

  // Vision Pipeline & Telemetry
  const pipelineRef = useRef<OpenCvChessPipeline | null>(null);
  if (!pipelineRef.current) {
    pipelineRef.current = new OpenCvChessPipeline();
  }

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const virtualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadedImgRef = useRef<HTMLImageElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [telemetry, setTelemetry] = useState<FrameTelemetry | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<FrameTelemetry[]>([]);
  const [squareMetrics, setSquareMetrics] = useState<SquareMetric[][] | null>(null);
  const [maxDelta, setMaxDelta] = useState<number>(0);
  const [lastDetectedInfo, setLastDetectedInfo] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [uploadedImageTick, setUploadedImageTick] = useState<number>(0);
  const [isScanningFen, setIsScanningFen] = useState<boolean>(false);
  const isScanningFenRef = useRef<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoScanPieces, setAutoScanPieces] = useState<boolean>(false);
  const [opponentMoveOnly, setOpponentMoveOnly] = useState<boolean>(false);
  const [capturedPreview, setCapturedPreview] = useState<CapturedBoardPreview | null>(null);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  // Stockfish UCI State (Elo-driven automatic Search Depth — Always Runs Locally)
  const [playerElo, setPlayerElo] = useState<number>(1600);
  const [autoDepthByElo, setAutoDepthByElo] = useState<boolean>(true);
  const [manualSearchDepth, setManualSearchDepth] = useState<number>(13);
  const searchDepth = autoDepthByElo
    ? Math.max(5, Math.min(18, Math.round(5 + ((Math.max(800, Math.min(2800, playerElo)) - 800) / 2000) * 13)))
    : manualSearchDepth;
  const [analysis, setAnalysis] = useState<StockfishAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzeSeqRef = useRef<number>(0);

  const isOnline = useOnlineStatus();
  const [externalServerUrl, setExternalServerUrl] = useState<string>(() =>
    getStoredExternalServerUrl()
  );
  const [externalServerId, setExternalServerId] = useState<string>(() =>
    getStoredExternalServerId()
  );
  const [visionApiUrl, setVisionApiUrl] = useState<string>(() =>
    getStoredVisionApiUrl()
  );
  const [remoteServerStatus, setRemoteServerStatus] = useState<RemoteServerStatus>(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return buildApiUrl(API_ROUTES.engineHealth) ? 'checking' : 'unconfigured';
  });
  const [activeEngineSource, setActiveEngineSource] = useState<ActiveEngineSource>('local-wasm');
  const [localEngineVerify, setLocalEngineVerify] =
    useState<LocalEngineVerificationResult | null>(null);
  const [isVerifyingEngine, setIsVerifyingEngine] = useState<boolean>(false);

  // Gemini Explanation & TTS State (on-demand toggle)
  const [voiceCoachEnabled, setVoiceCoachEnabled] = useState<boolean>(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState<boolean>(false);
  const [isSynthesizingAudio, setIsSynthesizingAudio] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<TtsVoiceName>('Kore');
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [moveSoundEnabled, setMoveSoundEnabled] = useState<boolean>(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoSpeakPendingRef = useRef<boolean>(false);

  // Hidden AI_CHESS portal & shared in-memory Key Vault admin session
  const [showDeveloperPortal, setShowDeveloperPortal] = useState<boolean>(false);
  const [vaultAdminToken, setVaultAdminToken] = useState<string>('');
  const isVaultAdminUnlocked = Boolean(vaultAdminToken);
  const brandTapTimesRef = useRef<number[]>([]);

  const handleLockAndHideVault = useCallback(() => {
    setVaultAdminToken('');
    setShowDeveloperPortal(false);
    setActiveWorkspaceTab((prev) => (prev === 'keyVault' ? 'analyzer' : prev));
  }, []);

  useEffect(() => {
    if (!vaultAdminToken && activeWorkspaceTab === 'keyVault') {
      setActiveWorkspaceTab('analyzer');
    }
  }, [vaultAdminToken, activeWorkspaceTab]);

  const handleBrandSecretTap = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const now = Date.now();
    const recent = brandTapTimesRef.current.filter((ts) => now - ts <= 1500);
    recent.push(now);
    brandTapTimesRef.current = recent;
    if (recent.length >= 5) {
      e.preventDefault();
      brandTapTimesRef.current = [];
      setShowDeveloperPortal(true);
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
  }, []);

  const playAudioUrl = useCallback(
    (url: string) => {
      stopAudioPlayback();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        setVoiceError(t.audioPlayError);
      };
      setIsPlayingAudio(true);
      audio.play().catch(() => {
        setIsPlayingAudio(false);
      });
    },
    [stopAudioPlayback, t.audioPlayError]
  );

  // Run Gemini Text Explanation + TTS Synthesis
  const triggerExplainAndSpeak = useCallback(
    async (
      targetAnalysis: StockfishAnalysisResult,
      moveCtx: { san: string; uci: string } | null
    ) => {
      setVoiceError(null);
      const explainUrl = buildApiUrl(API_ROUTES.explain, externalServerUrl);
      const ttsUrl = buildApiUrl(API_ROUTES.tts, externalServerUrl);
      if (!isOnline || !explainUrl || !ttsUrl) {
        setVoiceError(t.voiceCloudRequired);
        return;
      }

      setIsGeneratingExplanation(true);
      try {
        const authHeaders = await getAuthorizedClientHeaders(externalServerUrl, externalServerId);
        const expRes = await fetch(explainUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            fen: targetAnalysis.fen,
            lastMoveSan: moveCtx?.san,
            lastMoveUci: moveCtx?.uci,
            bestMoveSan: targetAnalysis.bestMoveSan,
            bestMoveUci: targetAnalysis.bestMove,
            evaluationLabel: targetAnalysis.evaluationLabel,
            turn: targetAnalysis.turn,
            topLineSan: targetAnalysis.lines[0]?.pvSan ?? [],
            playerElo,
            language,
          }),
        });
        const expData = await parseJsonResponse<{ explanation: string }>(
          expRes,
          t.voiceExplainFailed,
          t
        );

        const text = expData.explanation;
        setExplanationText(text);
        setIsGeneratingExplanation(false);

        // Synthesize multilingual audio with Gemini TTS
        setIsSynthesizingAudio(true);
        const ttsRes = await fetch(ttsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ text, voiceName: selectedVoice, language }),
        });
        const ttsData = await parseJsonResponse<{ audioBase64: string; mimeType?: string }>(
          ttsRes,
          t.voiceTtsFailed,
          t
        );

        const url = `data:${ttsData.mimeType || 'audio/wav'};base64,${ttsData.audioBase64}`;
        setAudioDataUrl(url);
        playAudioUrl(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.voiceGenericError;
        setVoiceError(msg);
      } finally {
        setIsGeneratingExplanation(false);
        setIsSynthesizingAudio(false);
      }
    },
    [externalServerId, externalServerUrl, isOnline, language, selectedVoice, playAudioUrl, playerElo, t]
  );

  // Run Stockfish 19 UCI analysis strictly locally via WebAssembly (or JS fallback)
  const runStockfishAnalysis = useCallback(
    async (
      targetFen: string,
      depth: number,
      moveCtxForSpeech: { san: string; uci: string } | null
    ): Promise<StockfishAnalysisResult | null> => {
      const seqId = ++analyzeSeqRef.current;

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const typed = await localStockfishEngine.analyze(
          targetFen,
          depth,
          3,
          playerElo,
          autoDepthByElo
        );
        const backend: ActiveEngineSource =
          localStockfishEngine.getActiveBackend() === 'asm' ? 'local-asm' : 'local-wasm';
        setActiveEngineSource(backend);

        if (analyzeSeqRef.current !== seqId) return null;
        setAnalysis(typed);

        // Update latest move evaluation label in history
        setMoveHistory((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          if (updated[0].fen === targetFen) {
            updated[0] = { ...updated[0], evaluationLabel: typed.evaluationLabel };
          }
          return updated;
        });

        if (autoSpeakPendingRef.current) {
          autoSpeakPendingRef.current = false;
          void triggerExplainAndSpeak(typed, moveCtxForSpeech);
        }
        return typed;
      } catch (err) {
        if (analyzeSeqRef.current !== seqId) {
          return null;
        }
        setAnalysisError(err instanceof Error ? err.message : t.stockfishStartFailed);
        autoSpeakPendingRef.current = false;
        return null;
      } finally {
        if (analyzeSeqRef.current === seqId) {
          setIsAnalyzing(false);
        }
      }
    },
    [autoDepthByElo, playerElo, t.stockfishStartFailed, triggerExplainAndSpeak]
  );

  const handleVerifyLocalEngine = useCallback(async () => {
    setIsVerifyingEngine(true);
    try {
      const result = await localStockfishEngine.verifyLocalEngine(meta.locale);
      setLocalEngineVerify(result);
      if (result.backend) {
        setActiveEngineSource(result.backend === 'asm' ? 'local-asm' : 'local-wasm');
      }
      return result;
    } finally {
      setIsVerifyingEngine(false);
    }
  }, [meta.locale]);

  // Preload & verify local WebAssembly Stockfish on mount so offline/local UCI works instantaneously
  useEffect(() => {
    void handleVerifyLocalEngine();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Probe external server for Vision Snapshot API & AI Voice Coach availability (Stockfish stays local)
  const probeAndAutoConnectServer = useCallback(
    async (urlOverride?: string, serverIdOverride?: string) => {
      const targetUrl = urlOverride ?? externalServerUrl;
      const targetServerId = serverIdOverride ?? externalServerId;
      if (!isOnline) {
        setRemoteServerStatus('offline');
        return;
      }

      if (!buildApiUrl(API_ROUTES.engineHealth, targetUrl)) {
        setRemoteServerStatus('unconfigured');
        return;
      }

      setRemoteServerStatus('checking');
      const health = await checkRemoteServerHealth(targetUrl, 3500, targetServerId);
      setRemoteServerStatus(health.status);
    },
    [externalServerId, externalServerUrl, isOnline]
  );

  useEffect(() => {
    void probeAndAutoConnectServer();
  }, [isOnline, externalServerUrl, externalServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic background check for external API server when online
  useEffect(() => {
    if (!isOnline || remoteServerStatus !== 'unreachable') return;
    const intervalId = globalThis.setInterval(() => {
      void probeAndAutoConnectServer();
    }, 25000);
    return () => globalThis.clearInterval(intervalId);
  }, [isOnline, remoteServerStatus, probeAndAutoConnectServer]);

  const handleSaveExternalServerUrl = useCallback(
    (nextRawUrl: string) => {
      const saved = saveExternalServerUrl(nextRawUrl);
      setExternalServerUrl(saved);
      void probeAndAutoConnectServer(saved, externalServerId);
    },
    [externalServerId, probeAndAutoConnectServer]
  );

  const handleSaveExternalServerId = useCallback(
    (nextRawId: string) => {
      const saved = saveExternalServerId(nextRawId);
      setExternalServerId(saved);
      void probeAndAutoConnectServer(externalServerUrl, saved);
    },
    [externalServerUrl, probeAndAutoConnectServer]
  );

  const handleSaveVisionApiUrl = useCallback((nextRawUrl: string) => {
    const saved = saveVisionApiUrl(nextRawUrl);
    setVisionApiUrl(saved);
    setScanError(null);
  }, []);

  // Initial Stockfish analysis & re-run on depth / Elo change (debounced slightly for smooth slider dragging)
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void runStockfishAnalysis(fen, searchDepth, null);
    }, 150);
    return () => globalThis.clearTimeout(timer);
  }, [searchDepth, playerElo, autoDepthByElo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit a move onto the synchronized board (called by CV detector or manual click)
  const commitSynchronizedMove = useCallback(
    (uci: string, moveSource: 'vision' | 'manual' | 'virtual') => {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      try {
        const move = chessRef.current.move({ from, to, promotion });
        if (!move) return false;

        const nextFen = chessRef.current.fen();
        setFen(nextFen);
        const moveCtx = {
          from: move.from,
          to: move.to,
          san: move.san,
          uci,
          source: moveSource,
          detectedAt: Date.now(),
        };
        setLastMove(moveCtx);

        if (moveSource === 'vision' && moveSoundEnabled) {
          playMoveTapSound(Boolean(move.captured));
        }

        // Keep virtual stream aligned if the user made a manual move on the digital board
        if (moveSource === 'manual') {
          virtualChessRef.current = new Chess(nextFen);
          setVirtualLastMove({ from: move.from, to: move.to });
          pipelineRef.current?.captureBaselineNextFrame();
        }

        const ply = chessRef.current.history().length;
        setMoveHistory((prev) => [
          {
            ply,
            san: move.san,
            uci,
            fen: nextFen,
            source: moveSource,
            timestamp: new Date().toLocaleTimeString(meta.locale, {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          },
          ...prev,
        ]);

        if (voiceCoachEnabled && autoSpeak) {
          autoSpeakPendingRef.current = true;
        }
        void runStockfishAnalysis(nextFen, searchDepth, { san: move.san, uci });
        return true;
      } catch {
        return false;
      }
    },
    [autoSpeak, meta.locale, moveSoundEnabled, runStockfishAnalysis, searchDepth, voiceCoachEnabled]
  );

  // Start Camera stream
  const startCameraStream = useCallback(async () => {
    setStreamError(null);
    stopMediaTracks();

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error(t.cameraUnsupported);
      }

      const acquireCameraStream = async (): Promise<MediaStream> => {
        const attempts: MediaStreamConstraints[] = [
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: Math.min(config.targetFps, 30), max: 60 },
            },
            audio: false,
          },
          {
            video: { facingMode: 'environment' },
            audio: false,
          },
          {
            video: true,
            audio: false,
          },
        ];

        let lastErr: unknown;
        for (const constraints of attempts) {
          try {
            return await navigator.mediaDevices.getUserMedia(constraints);
          } catch (err) {
            lastErr = err;
            const name = (err as { name?: string })?.name ?? '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
              throw err;
            }
          }
        }
        throw lastErr;
      };

      const stream = await acquireCameraStream();

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        const vid = videoRef.current;
        vid.srcObject = stream;
        vid.onloadedmetadata = () => {
          if (vid.videoWidth > 0 && vid.videoHeight > 0) {
            setRoi(computeFitRoi(vid.videoWidth, vid.videoHeight, 1));
            pipelineRef.current?.resetBaseline();
          }
        };
        await vid.play().catch(() => undefined);
        if (vid.videoWidth > 0 && vid.videoHeight > 0) {
          setRoi(computeFitRoi(vid.videoWidth, vid.videoHeight, 1));
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setIsStreaming(false);
          stopMediaTracks();
        };
      }

      pipelineRef.current?.resetBaseline();
      setIsStreaming(true);
    } catch (err) {
      const errName = (err as { name?: string })?.name ?? '';
      const rawMsg = err instanceof Error ? err.message : '';
      const isDenied =
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        /permission|denied/i.test(rawMsg);
      const friendlyMsg = isDenied
        ? t.cameraDenied
        : errName === 'NotFoundError' || errName === 'DevicesNotFoundError'
        ? t.cameraNotFound
        : errName === 'NotReadableError'
        ? t.cameraInUse
        : rawMsg || t.cameraAccessFailed;
      setStreamError(friendlyMsg);
      setIsStreaming(false);
    }
  }, [config.targetFps, stopMediaTracks, t]);

  // Switch capture source
  const handleSelectSource = useCallback(
    async (nextSource: CaptureSource) => {
      setStreamError(null);
      setScanError(null);
      setSource(nextSource);
      pipelineRef.current?.resetBaseline();

      if (nextSource === 'virtual') {
        stopMediaTracks();
        setOpponentMoveOnly(false);
        setRoi(DEFAULT_VIRTUAL_ROI);
        setIsStreaming(true);
      } else if (nextSource === 'camera') {
        setOpponentMoveOnly(true);
        setRoi([
          { x: 0.22, y: 0.22 },
          { x: 0.78, y: 0.22 },
          { x: 0.78, y: 0.78 },
          { x: 0.22, y: 0.78 },
        ]);
        await startCameraStream();
      } else {
        stopMediaTracks();
        setIsStreaming(false);
      }
    },
    [startCameraStream, stopMediaTracks]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaTracks();
      stopAudioPlayback();
    };
  }, [stopMediaTracks, stopAudioPlayback]);

  // Main Real-Time OpenCV Processing Loop using requestAnimationFrame for smooth 60 FPS pacing
  useEffect(() => {
    if (!isStreaming || source === 'image') return;

    let rafId = 0;
    let lastProcessedTime = 0;
    let lastUiSyncTime = 0;
    const minFrameGapMs = config.targetFps >= 60 ? 0 : 1000 / config.targetFps;

    const tick = (now: number) => {
      rafId = globalThis.requestAnimationFrame(tick);

      if (minFrameGapMs > 0 && now - lastProcessedTime < minFrameGapMs - 1.5) {
        return;
      }
      lastProcessedTime = now;

      const pipeline = pipelineRef.current;
      if (!pipeline) return;

      let srcElem: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null = null;
      let srcW = 0;
      let srcH = 0;

      if (source === 'virtual') {
        const vCanvas = virtualCanvasRef.current;
        if (!vCanvas) return;
        renderVirtualBoardToCanvas(
          vCanvas,
          virtualChessRef.current.fen(),
          config.orientation,
          virtualLastMove,
          simulateLightingNoise
        );
        srcElem = vCanvas;
        srcW = vCanvas.width;
        srcH = vCanvas.height;
      } else if (source === 'camera') {
        const vid = videoRef.current;
        if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;
        srcElem = vid;
        srcW = vid.videoWidth;
        srcH = vid.videoHeight;
      } else if (source === 'image') {
        const img = uploadedImgRef.current;
        if (!img || !img.complete || img.naturalWidth === 0) return;
        srcElem = img;
        srcW = img.naturalWidth;
        srcH = img.naturalHeight;
      }

      if (!srcElem || srcW === 0 || srcH === 0) return;

      const result = pipeline.processFrame(
        srcElem,
        srcW,
        srcH,
        roi,
        config,
        viewMode,
        processedCanvasRef.current,
        chessRef.current.fen(),
        opponentMoveOnly
      );

      // Throttle React telemetry & 8x8 matrix UI re-renders (~15Hz) so 60 FPS vision loop stays zero-jank
      if (now - lastUiSyncTime >= 68) {
        lastUiSyncTime = now;
        setTelemetry(result.telemetry);
        setTelemetryHistory((prev) => [...prev.slice(-39), result.telemetry]);
        setSquareMetrics(result.squareMetrics);
        setMaxDelta(result.maxDelta);
      }

      if (result.candidateMove) {
        const { uci, san, confidence } = result.candidateMove;
        setLastDetectedInfo(t.detectedMoveStatus(san, uci, confidence));
        commitSynchronizedMove(uci, 'vision');
      }
    };

    rafId = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(rafId);
  }, [
    isStreaming,
    source,
    roi,
    config,
    viewMode,
    virtualLastMove,
    simulateLightingNoise,
    opponentMoveOnly,
    commitSynchronizedMove,
    t,
  ]);

  // Step through preset game inside the Virtual Stream (pixels change -> OpenCV detects the move!)
  const handleStepVirtualMove = () => {
    unlockAudioContext();
    const preset = SAMPLE_GAMES.find((g) => g.id === selectedPresetId) ?? SAMPLE_GAMES[0];
    if (presetStepIndex >= preset.moves.length) return;

    const uci = preset.moves[presetStepIndex];
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;

    try {
      const move = virtualChessRef.current.move({ from, to, promotion });
      if (move) {
        setVirtualLastMove({ from: move.from, to: move.to });
        setPresetStepIndex((i) => i + 1);
      }
    } catch {
      // If user diverged from preset via manual board moves, play Stockfish's top reply in the virtual stream
      virtualChessRef.current = new Chess(chessRef.current.fen());
      const fallbackUci = analysis?.bestMove;
      if (fallbackUci && fallbackUci.length >= 4) {
        try {
          const fbMove = virtualChessRef.current.move({
            from: fallbackUci.slice(0, 2),
            to: fallbackUci.slice(2, 4),
            promotion: fallbackUci.length > 4 ? fallbackUci[4] : undefined,
          });
          if (fbMove) {
            setVirtualLastMove({ from: fbMove.from, to: fbMove.to });
          }
        } catch {
          // Ignore if no fallback move
        }
      }
    }
  };

  const handleResetAll = () => {
    const fresh = new Chess();
    chessRef.current = fresh;
    virtualChessRef.current = new Chess();
    setFen(fresh.fen());
    setLastMove(null);
    setVirtualLastMove(null);
    setPresetStepIndex(0);
    setMoveHistory([]);
    setLastDetectedInfo(null);
    setScanError(null);
    setExplanationText(null);
    setAudioDataUrl(null);
    stopAudioPlayback();
    pipelineRef.current?.resetBaseline();
    void runStockfishAnalysis(fresh.fen(), searchDepth, null);
  };

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    handleResetAll();
  };

  const handleUndoMove = () => {
    const undone = chessRef.current.undo();
    if (!undone) return;
    const nextFen = chessRef.current.fen();
    setFen(nextFen);
    virtualChessRef.current = new Chess(nextFen);
    setLastMove(null);
    setVirtualLastMove(null);
    setMoveHistory((prev) => prev.slice(1));
    pipelineRef.current?.captureBaselineNextFrame();
    void runStockfishAnalysis(nextFen, searchDepth, null);
  };

  const applyCustomFen = useCallback(
    (rawFen: string, skipAnalysis = false): boolean => {
      try {
        const nextChess = new Chess(rawFen);
        const canonical = nextChess.fen();
        chessRef.current = nextChess;
        virtualChessRef.current = new Chess(canonical);
        setFen(canonical);
        setLastMove(null);
        setVirtualLastMove(null);
        setMoveHistory([]);
        setScanError(null);
        pipelineRef.current?.captureBaselineNextFrame();
        if (!skipAnalysis) {
          void runStockfishAnalysis(canonical, searchDepth, null);
        }
        return true;
      } catch {
        return false;
      }
    },
    [runStockfishAnalysis, searchDepth]
  );

  const handleToggleTurn = useCallback(() => {
    const parts = chessRef.current.fen().split(' ');
    if (parts.length < 4) return;
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-'; // Reset en-passant square when flipping side to move
    applyCustomFen(parts.join(' '));
  }, [applyCustomFen]);

  const resolvedVisionEndpoint = resolveVisionSnapshotUrl(visionApiUrl, externalServerUrl);

  const handleScanBoardFen = useCallback(
    async (isAuto = false) => {
      if (isScanningFenRef.current) return;
      if (!isAuto) {
        unlockAudioContext();
      }
      setScanError(null);
      const pipeline = pipelineRef.current;
      if (!pipeline) return;

      let srcElem: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null = null;
      let srcW = 0;
      let srcH = 0;

      if (source === 'virtual') {
        const vCanvas = virtualCanvasRef.current;
        if (vCanvas) {
          srcElem = vCanvas;
          srcW = vCanvas.width;
          srcH = vCanvas.height;
        }
      } else if (source === 'camera') {
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
          srcElem = vid;
          srcW = vid.videoWidth;
          srcH = vid.videoHeight;
        }
      } else if (source === 'image') {
        const img = uploadedImgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
          srcElem = img;
          srcW = img.naturalWidth;
          srcH = img.naturalHeight;
        }
      }

      if (!srcElem || srcW === 0 || srcH === 0) {
        if (!isAuto) setScanError(t.noActiveFrameError);
        return;
      }

      // Capture raw screen-space ROI (bottom half = player area; Black flip happens programmatically on the 8x8 matrix)
      const dataUrl = pipeline.captureRoiDataUrl(srcElem, srcW, srcH, roi, config.orientation, 640, true);
      if (!dataUrl) {
        if (!isAuto) setScanError(t.roiCaptureError);
        return;
      }

      const capturedAt = new Date().toLocaleTimeString(meta.locale, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      if (!isAuto) {
        setCapturedPreview({
          imageUrl: dataUrl,
          capturedAt,
          orientation: config.orientation,
          flippedForBlack: config.orientation === 'black',
          detectedOpponentMove: null,
          bestMoveSan: null,
          bestMoveUci: null,
          evaluationLabel: null,
          fen: chessRef.current.fen(),
        });
      }

      const boardFenUrl = resolveVisionSnapshotUrl(visionApiUrl, externalServerUrl);
      if (!isOnline || !boardFenUrl) {
        setScanError(t.aiScanCloudRequired);
        return;
      }

      isScanningFenRef.current = true;
      setIsScanningFen(true);
      try {
        const authHeaders = await getAuthorizedClientHeaders(externalServerUrl, externalServerId);
        const res = await fetch(boardFenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: 'image/jpeg',
            playerColor: config.orientation,
            currentFen: chessRef.current.fen(),
          }),
        });
        const data = await parseJsonResponse<{
          fen?: string;
          boardFen?: string;
          ranks?: string[];
          turn?: 'w' | 'b';
          screenMatrix?: BoardMatrix8x8;
          boardMatrix?: BoardMatrix8x8;
          flippedForBlack?: boolean;
        }>(res, t.aiScanReadFailed, t);

        let resolvedFen = (data.fen ?? data.boardFen ?? '').trim();
        let resolvedTurn: 'w' | 'b' =
          data.turn === 'b' ? 'b' : data.turn === 'w' ? 'w' : config.orientation === 'black' ? 'b' : 'w';
        let flippedForBlack = config.orientation === 'black';
        let detectedOpponentMove: { san: string; uci: string } | null = null;

        let candidateMatrix: BoardMatrix8x8 | null = null;
        if (Array.isArray(data.screenMatrix) && data.screenMatrix.length === 8) {
          candidateMatrix = data.screenMatrix;
        } else if (Array.isArray(data.boardMatrix) && data.boardMatrix.length === 8) {
          candidateMatrix = data.boardMatrix;
        } else if (Array.isArray(data.ranks) && data.ranks.length === 8) {
          candidateMatrix = rowsToBoardMatrix(data.ranks);
        }

        if (candidateMatrix) {
          const matrixResult = analyzeBoardMatrixPerspective(
            candidateMatrix,
            config.orientation,
            chessRef.current.fen()
          );
          resolvedFen = matrixResult.fen;
          resolvedTurn = matrixResult.turn;
          flippedForBlack = matrixResult.flippedForBlack;
          if (matrixResult.detectedOpponentMove) {
            detectedOpponentMove = {
              san: matrixResult.detectedOpponentMove.san,
              uci: matrixResult.detectedOpponentMove.uci,
            };
          }
        } else if (resolvedFen) {
          // Support external endpoints returning piece-placement only (1 field) or partial FEN
          const fenFields = resolvedFen.split(/\s+/);
          if (fenFields.length === 1) {
            resolvedFen = `${fenFields[0]} ${resolvedTurn} - - 0 1`;
          } else if (fenFields.length < 4) {
            resolvedFen = `${fenFields[0]} ${fenFields[1] ?? resolvedTurn} ${fenFields[2] ?? '-'} - 0 1`;
          }
        }

        if (!resolvedFen) {
          throw new Error(t.aiScanReadFailed);
        }

        // Normalize via chess.js to validate and compare placement
        let canonicalFen: string;
        try {
          canonicalFen = new Chess(resolvedFen).fen();
        } catch {
          throw new Error(t.illegalBoardPosition);
        }

        const nextPlacement = canonicalFen.split(' ')[0];
        const currentPlacement = chessRef.current.fen().split(' ')[0];
        const placementChanged = nextPlacement !== currentPlacement;

        if (isAuto && !placementChanged) {
          return;
        }

        const applied = applyCustomFen(canonicalFen, true);
        if (!applied) {
          throw new Error(t.illegalBoardPosition);
        }

        if (moveSoundEnabled) {
          playMoveTapSound(false);
        }

        const perspectiveLabel = flippedForBlack ? t.perspectiveBlackFlipped : t.perspectiveWhiteBottom;
        setLastDetectedInfo(
          t.scanReadSummary(
            perspectiveLabel,
            detectedOpponentMove?.san ?? null,
            resolvedTurn === 'b' ? t.blackName : t.whiteName
          )
        );

        // Immediately run LOCAL Stockfish WebAssembly UCI analysis for the newly placed position
        const uciResult = await runStockfishAnalysis(
          canonicalFen,
          searchDepth,
          detectedOpponentMove
        );

        setCapturedPreview({
          imageUrl: dataUrl,
          capturedAt,
          orientation: config.orientation,
          flippedForBlack,
          detectedOpponentMove,
          bestMoveSan: uciResult?.bestMoveSan ?? null,
          bestMoveUci: uciResult?.bestMove ?? null,
          evaluationLabel: uciResult?.evaluationLabel ?? null,
          fen: canonicalFen,
        });
      } catch (err) {
        if (!isAuto) {
          setScanError(err instanceof Error ? err.message : t.aiScanGenericFailed);
        }
      } finally {
        isScanningFenRef.current = false;
        setIsScanningFen(false);
      }
    },
    [
      applyCustomFen,
      config.orientation,
      externalServerId,
      externalServerUrl,
      isOnline,
      meta.locale,
      moveSoundEnabled,
      roi,
      runStockfishAnalysis,
      searchDepth,
      source,
      t,
      visionApiUrl,
    ]
  );

  // Automatic external API snapshot scanning & piece placement loop
  useEffect(() => {
    if (!autoScanPieces || !isOnline || !resolvedVisionEndpoint) return;
    if (source === 'image') {
      void handleScanBoardFen(true);
      return;
    }
    if (!isStreaming) return;

    void handleScanBoardFen(true);
    const intervalId = globalThis.setInterval(() => {
      void handleScanBoardFen(true);
    }, 4500);
    return () => globalThis.clearInterval(intervalId);
  }, [autoScanPieces, isOnline, isStreaming, resolvedVisionEndpoint, source, handleScanBoardFen]);

  // Re-process static uploaded image only when image, ROI, config, or viewMode changes
  useEffect(() => {
    if (source !== 'image' || uploadedImageTick === 0) return;
    const img = uploadedImgRef.current;
    const pipeline = pipelineRef.current;
    if (!img || !img.complete || img.naturalWidth === 0 || !pipeline) return;

    const res = pipeline.processFrame(
      img,
      img.naturalWidth,
      img.naturalHeight,
      roi,
      config,
      viewMode,
      processedCanvasRef.current,
      chessRef.current.fen()
    );
    setTelemetry(res.telemetry);
    setSquareMetrics(res.squareMetrics);
    setMaxDelta(res.maxDelta);
  }, [source, uploadedImageTick, roi, config, viewMode]);

  const handleUploadImageFile = (file: File) => {
    stopMediaTracks();
    setScanError(null);
    setSource('image');
    setIsStreaming(false);
    const reader = new FileReader();
    reader.onload = () => {
      if (uploadedImgRef.current && typeof reader.result === 'string') {
        const img = uploadedImgRef.current;
        img.onload = () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setRoi(computeFitRoi(img.naturalWidth, img.naturalHeight, 1));
          }
          pipelineRef.current?.resetBaseline();
          setUploadedImageTick((t) => t + 1);
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleStream = () => {
    unlockAudioContext();
    if (isStreaming) {
      setIsStreaming(false);
      if (source === 'camera') {
        stopMediaTracks();
      }
    } else {
      if (source === 'camera') {
        void startCameraStream();
      } else {
        setIsStreaming(true);
      }
    }
  };

  const handleClearAppCache = useCallback(async () => {
    setIsClearingCache(true);
    setCacheNotice(null);
    let clearedCount = 0;

    try {
      if ('caches' in globalThis && typeof globalThis.caches?.keys === 'function') {
        const keys = await globalThis.caches.keys();
        for (const key of keys) {
          const deleted = await globalThis.caches.delete(key);
          if (deleted) clearedCount++;
        }
      }

      if ('serviceWorker' in navigator && typeof navigator.serviceWorker?.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          const ok = await reg.unregister();
          if (ok) clearedCount++;
        }
      }

      try {
        const savedSolved = globalThis.localStorage?.getItem(SOLVED_PUZZLES_STORAGE_KEY);
        const savedCurrentPuzzle = globalThis.localStorage?.getItem(CURRENT_PUZZLE_STORAGE_KEY);
        globalThis.localStorage?.clear();
        globalThis.sessionStorage?.clear();
        saveStoredLanguage(language);
        if (externalServerUrl) {
          saveExternalServerUrl(externalServerUrl);
        }
        if (externalServerId) {
          saveExternalServerId(externalServerId);
        }
        if (visionApiUrl) {
          saveVisionApiUrl(visionApiUrl);
        }
        if (savedSolved) {
          globalThis.localStorage?.setItem(SOLVED_PUZZLES_STORAGE_KEY, savedSolved);
        }
        if (savedCurrentPuzzle) {
          globalThis.localStorage?.setItem(CURRENT_PUZZLE_STORAGE_KEY, savedCurrentPuzzle);
        }
      } catch {
        // ignore restricted storage contexts
      }

      if (typeof globalThis.indexedDB?.databases === 'function') {
        try {
          const dbs = await globalThis.indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              globalThis.indexedDB.deleteDatabase(db.name);
              clearedCount++;
            }
          }
        } catch {
          // ignore indexedDB enumeration errors
        }
      }

      // Reset in-memory vision buffers, cached Stockfish WASM worker & transient previews
      pipelineRef.current?.resetBaseline();
      localStockfishEngine.clearCache();
      setLocalEngineVerify(null);
      setTelemetryHistory([]);
      setCapturedPreview(null);
      setAudioDataUrl(null);
      setScanError(null);
      setVoiceError(null);
      setAnalysisError(null);
      stopAudioPlayback();

      setCacheNotice(
        clearedCount > 0 ? t.cacheClearedCount(clearedCount) : t.cacheClearedSuccess
      );
      void handleVerifyLocalEngine();
      void runStockfishAnalysis(chessRef.current.fen(), searchDepth, null);
    } catch {
      setCacheNotice(t.cacheClearedSuccess);
    } finally {
      setIsClearingCache(false);
      globalThis.setTimeout(() => {
        setCacheNotice(null);
      }, 4000);
    }
  }, [
    externalServerId,
    externalServerUrl,
    handleVerifyLocalEngine,
    language,
    runStockfishAnalysis,
    searchDepth,
    stopAudioPlayback,
    t,
    visionApiUrl,
  ]);

  return (
    <div className="relative min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Full-Height Vertical Background Artwork */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <img
          src="/assets/aistudio/FB_IMG_1795486450572_eb120a57.jpg"
          alt=""
          className="w-full h-full object-cover object-center opacity-95"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0E14]/30 via-[#0B0E14]/15 to-[#0B0E14]/40" />
      </div>

      {/* Top Bar Contract: Single Row, 3 Zones */}
      <header className="sticky top-0 z-40 bg-[#0B0E14]/35 backdrop-blur-sm border-b border-slate-400/35">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="#vision-stage"
            onClick={handleBrandSecretTap}
            className="flex items-center gap-2 sm:gap-2.5 text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 select-none"
          >
            <img
              src="/assets/aistudio/apple-touch-icon_f4ce301f.png"
              alt={t.brandLogoAlt}
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg object-cover ring-1 ring-amber-400/45 shrink-0"
            />
            <span>{t.brandName}</span>
          </a>

          {/* Zone 2: Concise Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-200">
            <a
              href="#vision-stage"
              onClick={() => setActiveWorkspaceTab('analyzer')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navVision}
            </a>
            <a
              href="#board-stage"
              onClick={() => setActiveWorkspaceTab('analyzer')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navBoard}
            </a>
            <a
              href="#profiler-stage"
              onClick={() => setActiveWorkspaceTab('analyzer')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navProfiler}
            </a>
          </nav>

          {/* Zone 3: AI_CHESS Hidden Portal Button + Primary Action */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeveloperPortal(true)}
              aria-label="AI_CHESS"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-mono font-bold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                isVaultAdminUnlocked
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/60'
                  : 'bg-slate-900/75 hover:bg-slate-800 text-slate-200 border-slate-500/50'
              }`}
            >
              {isVaultAdminUnlocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              )}
              <span>AI_CHESS</span>
            </button>
            <button
              type="button"
              onClick={handleToggleStream}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-md transition-colors whitespace-nowrap shrink-0 shadow-sm ${
                isStreaming
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
              }`}
            >
              {isStreaming ? t.stopMonitoring : t.startMonitoring}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-2.5 sm:px-6 py-3.5 sm:py-6 space-y-4 sm:space-y-6">
        {/* Intro Strip (Above the photo box) */}
        <section className="relative z-20 flex flex-wrap items-end justify-between gap-3 sm:gap-4 p-3 sm:p-5 rounded-xl border border-slate-400/40 bg-[#0F1522]/25 backdrop-blur-sm shadow-lg">
          <div className="max-w-2xl">
            <h1 className="text-lg sm:text-3xl font-bold text-white leading-snug text-balance">
              {t.heroTitle}
            </h1>
            <p className="mt-1 sm:mt-1.5 text-xs sm:text-base text-slate-100 leading-relaxed">
              {t.heroSubtitleBefore}
              <span className="font-mono font-bold text-white">8×8</span>
              {t.heroSubtitleAfter}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-sm text-slate-100">
            <span>
              {t.streamStatusLabel}{' '}
              <strong className={isStreaming ? 'text-emerald-300 font-bold' : 'text-slate-100 font-semibold'}>
                {isStreaming ? t.streamActive : t.streamPaused}
              </strong>
            </span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="font-mono font-semibold tabular-nums text-white" dir="ltr">
              {config.resolution}px @ {config.targetFps} FPS
            </span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span className="font-mono font-semibold tabular-nums text-white" dir="ltr">
              {t.depthShort} {searchDepth}
            </span>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => void handleClearAppCache()}
              disabled={isClearingCache}
              title={t.clearCacheTooltip}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-sm font-bold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 disabled:opacity-50 disabled:pointer-events-none rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isClearingCache ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span>{isClearingCache ? t.clearingCache : t.clearCache}</span>
            </button>
            {cacheNotice && (
              <span className="text-[11px] sm:text-sm font-semibold text-emerald-200 bg-emerald-500/25 border border-emerald-400/55 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md">
                {cacheNotice}
              </span>
            )}
          </div>
        </section>

        {/* Clean Image Box (without any text overlay) */}
        <div className="overflow-hidden rounded-xl border border-slate-400/40 bg-[#0F1522]/20 shadow-lg">
          <img
            src="/assets/aistudio/Screenshot_20261125_184553_com_hihonor_photos_SlotAlbumActivity_b33f732c.jpg"
            alt={t.brandName}
            className="w-full h-44 sm:h-64 lg:h-80 object-cover object-[center_28%] block select-none"
          />
        </div>

        {/* Workspace Mode Tabs: Board & Vision | Interactive Coach | Solve Puzzles */}
        <nav
          aria-label={t.tabAnalyzer}
          className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 p-1.5 rounded-xl border border-slate-400/40 bg-[#0F1522]/30 backdrop-blur-sm shadow-md"
        >
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('analyzer')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              activeWorkspaceTab === 'analyzer'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:bg-slate-800/80'
            }`}
          >
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{t.tabAnalyzer}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('coach')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              activeWorkspaceTab === 'coach'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:bg-slate-800/80'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{t.tabCoach}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('puzzles')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              activeWorkspaceTab === 'puzzles'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:bg-slate-800/80'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{t.tabPuzzles}</span>
          </button>

          {isVaultAdminUnlocked && (
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('keyVault')}
              className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                activeWorkspaceTab === 'keyVault'
                  ? 'bg-cyan-400 text-slate-950 shadow-sm'
                  : 'text-slate-100 hover:bg-slate-800/80'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{t.tabKeyVault}</span>
            </button>
          )}
        </nav>

        {activeWorkspaceTab === 'coach' && <InteractiveCoachTab />}

        {activeWorkspaceTab === 'puzzles' && <PuzzlesTab />}

        {activeWorkspaceTab === 'keyVault' && isVaultAdminUnlocked && (
          <SecurityKeyVaultTab
            externalServerUrl={externalServerUrl}
            externalServerId={externalServerId}
            adminToken={vaultAdminToken}
            onAdminTokenChange={setVaultAdminToken}
            onLockAndHide={handleLockAndHideVault}
          />
        )}

        {activeWorkspaceTab === 'analyzer' && (
          <>
        {/* Primary 3-Zone Workspace Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-5 items-start">
          {/* Column 1: Live OpenCV Vision Capture Stage */}
          <div id="vision-stage" className="xl:col-span-5">
            <LiveVisionStage
              source={source}
              isStreaming={isStreaming}
              viewMode={viewMode}
              roi={roi}
              telemetry={telemetry}
              lastDetectedInfo={lastDetectedInfo}
              errorMsg={streamError}
              videoRef={videoRef}
              virtualCanvasRef={virtualCanvasRef}
              uploadedImgRef={uploadedImgRef}
              processedCanvasRef={processedCanvasRef}
              selectedPresetId={selectedPresetId}
              presetStepIndex={presetStepIndex}
              simulateLightingNoise={simulateLightingNoise}
              onSelectSource={handleSelectSource}
              onToggleStream={handleToggleStream}
              onChangeViewMode={setViewMode}
              onUpdateRoi={setRoi}
              onResetRoi={() => {
                if (source === 'virtual') {
                  setRoi(DEFAULT_VIRTUAL_ROI);
                } else if (
                  source === 'camera' &&
                  videoRef.current &&
                  videoRef.current.videoWidth > 0
                ) {
                  setRoi(
                    computeFitRoi(videoRef.current.videoWidth, videoRef.current.videoHeight, 1)
                  );
                } else if (
                  source === 'image' &&
                  uploadedImgRef.current &&
                  uploadedImgRef.current.naturalWidth > 0
                ) {
                  setRoi(
                    computeFitRoi(
                      uploadedImgRef.current.naturalWidth,
                      uploadedImgRef.current.naturalHeight,
                      1
                    )
                  );
                } else {
                  setRoi([
                    { x: 0.22, y: 0.22 },
                    { x: 0.78, y: 0.22 },
                    { x: 0.78, y: 0.78 },
                    { x: 0.22, y: 0.78 },
                  ]);
                }
                pipelineRef.current?.captureBaselineNextFrame();
              }}
              onCalibrateBaseline={() => {
                pipelineRef.current?.captureBaselineNextFrame();
                setLastDetectedInfo(t.baselineCalibratedStatus);
              }}
              onUploadImageFile={handleUploadImageFile}
              onSelectPreset={handleSelectPreset}
              onStepVirtualMove={handleStepVirtualMove}
              onResetVirtualGame={handleResetAll}
              onToggleLightingNoise={() => setSimulateLightingNoise((v) => !v)}
              moveSoundEnabled={moveSoundEnabled}
              onToggleMoveSound={() => {
                unlockAudioContext();
                setMoveSoundEnabled((v) => !v);
              }}
              isScanningFen={isScanningFen}
              onScanBoardFen={() => void handleScanBoardFen()}
            />
          </div>

          {/* Column 2: Synchronized Digital Board + Capture Preview & UCI Best Move Panel Underneath */}
          <div id="board-stage" className="xl:col-span-4 space-y-3.5 sm:space-y-5">
            <DigitalBoard
              fen={fen}
              orientation={config.orientation}
              lastMove={lastMove}
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              onManualMove={(from, to, promotion) =>
                commitSynchronizedMove(`${from}${to}${promotion ?? ''}`, 'manual')
              }
              onFlipOrientation={() => {
                pipelineRef.current?.captureBaselineNextFrame();
                setConfig((prev) => ({
                  ...prev,
                  orientation: prev.orientation === 'white' ? 'black' : 'white',
                }));
              }}
              onUndoMove={handleUndoMove}
              onResetBoard={handleResetAll}
              onToggleTurn={handleToggleTurn}
              onApplyFen={applyCustomFen}
              canUndo={moveHistory.length > 0}
            />

            <CapturePreviewPanel
              isScanningFen={isScanningFen}
              scanError={scanError}
              onScanBoardFen={() => void handleScanBoardFen(false)}
              autoScanPieces={autoScanPieces}
              onToggleAutoScanPieces={() => setAutoScanPieces((v) => !v)}
              visionApiUrl={visionApiUrl}
              resolvedVisionEndpoint={resolvedVisionEndpoint}
              onSaveVisionApiUrl={handleSaveVisionApiUrl}
              orientation={config.orientation}
              onChangeOrientation={(nextOrientation) => {
                pipelineRef.current?.captureBaselineNextFrame();
                setConfig((prev) => ({ ...prev, orientation: nextOrientation }));
              }}
              opponentMoveOnly={opponentMoveOnly}
              onToggleOpponentMoveOnly={() => setOpponentMoveOnly((v) => !v)}
              capturedPreview={capturedPreview}
              isAnalyzingBestMove={isAnalyzing}
              onClearCapturedPreview={() => setCapturedPreview(null)}
              onApplyBestMoveFromPreview={(uci) => {
                commitSynchronizedMove(uci, 'manual');
              }}
            />
          </div>

          {/* Column 3: Stockfish UCI Engine + Gemini Voice Coach + Move History */}
          <div className="xl:col-span-3">
            <AnalysisAndVoicePanel
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              searchDepth={searchDepth}
              playerElo={playerElo}
              autoDepthByElo={autoDepthByElo}
              onChangeSearchDepth={(nextDepth) => {
                setAutoDepthByElo(false);
                setManualSearchDepth(nextDepth);
              }}
              onRestoreAutoDepth={() => setAutoDepthByElo(true)}
              voiceCoachEnabled={voiceCoachEnabled}
              onToggleVoiceCoach={() => {
                setVoiceCoachEnabled((prev) => {
                  const next = !prev;
                  if (!next) {
                    setAutoSpeak(false);
                    autoSpeakPendingRef.current = false;
                    stopAudioPlayback();
                  }
                  return next;
                });
              }}
              explanationText={explanationText}
              isGeneratingExplanation={isGeneratingExplanation}
              isSynthesizingAudio={isSynthesizingAudio}
              isPlayingAudio={isPlayingAudio}
              voiceError={voiceError}
              autoSpeak={autoSpeak}
              selectedVoice={selectedVoice}
              hasAudioReady={Boolean(audioDataUrl)}
              moveHistory={moveHistory}
              onToggleAutoSpeak={() => setAutoSpeak((v) => !v)}
              onSelectVoice={setSelectedVoice}
              onGenerateAndSpeak={() => {
                if (analysis) {
                  void triggerExplainAndSpeak(
                    analysis,
                    lastMove ? { san: lastMove.san, uci: lastMove.uci } : null
                  );
                }
              }}
              onReplayOrStopAudio={() => {
                if (isPlayingAudio) {
                  stopAudioPlayback();
                } else if (audioDataUrl) {
                  playAudioUrl(audioDataUrl);
                }
              }}
              onApplyPvMove={(uci) => commitSynchronizedMove(uci, 'manual')}
            />
          </div>
        </div>

        {/* Full-Width Resource vs. Accuracy Trade-off Profiler */}
        <div id="profiler-stage">
          <ResourceTradeoffConsole
            config={config}
            telemetry={telemetry}
            telemetryHistory={telemetryHistory}
            squareMetrics={squareMetrics}
            maxDelta={maxDelta}
            playerElo={playerElo}
            autoDepthByElo={autoDepthByElo}
            effectiveDepth={searchDepth}
            onChangeConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
            onChangePlayerElo={(elo) => {
              setPlayerElo(elo);
              setAutoDepthByElo(true);
            }}
            onToggleAutoDepthByElo={() => setAutoDepthByElo((v) => !v)}
          />
        </div>
          </>
        )}
      </main>

      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg border border-amber-400/60 bg-[#0B0E14]/90 backdrop-blur-md px-3.5 py-2 text-xs sm:text-sm font-semibold text-amber-200 shadow-xl"
        >
          <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
          <span>{t.offlineBanner}</span>
        </div>
      )}

      <DeveloperPortalModal
        open={showDeveloperPortal}
        onClose={() => setShowDeveloperPortal(false)}
        externalServerUrl={externalServerUrl}
        externalServerId={externalServerId}
        adminToken={vaultAdminToken}
        onAdminTokenChange={setVaultAdminToken}
        onOpenKeyVault={() => {
          setShowDeveloperPortal(false);
          setActiveWorkspaceTab('keyVault');
        }}
        onLockAndHide={handleLockAndHideVault}
        isOnline={isOnline}
        activeEngineSource={activeEngineSource}
        localEngineVerify={localEngineVerify}
        isVerifyingEngine={isVerifyingEngine}
        onVerifyLocalEngine={() => void handleVerifyLocalEngine()}
        onEngineAutoUpdated={() => {
          void runStockfishAnalysis(chessRef.current.fen(), searchDepth, null);
        }}
        remoteServerStatus={remoteServerStatus}
        onSaveExternalServerUrl={handleSaveExternalServerUrl}
        onSaveExternalServerId={handleSaveExternalServerId}
        onReconnectServer={() => void probeAndAutoConnectServer()}
      />
    </div>
  );
}
