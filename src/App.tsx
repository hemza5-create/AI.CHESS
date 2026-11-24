import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Copy, Check, Download, Trash2, Loader2 } from 'lucide-react';
import { LiveVisionStage } from './components/LiveVisionStage.tsx';
import { DigitalBoard } from './components/DigitalBoard.tsx';
import { AnalysisAndVoicePanel } from './components/AnalysisAndVoicePanel.tsx';
import { ResourceTradeoffConsole } from './components/ResourceTradeoffConsole.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { OpenCvChessPipeline, computeFitRoi } from './vision/opencvPipeline.ts';
import { analyzeBoardMatrixPerspective, type BoardMatrix8x8 } from './vision/boardMatrix.ts';
import { renderVirtualBoardToCanvas, SAMPLE_GAMES } from './vision/virtualBoardRenderer.ts';
import { playMoveTapSound, unlockAudioContext } from './utils/soundEffects.ts';
import { localStockfishEngine } from './engine/localStockfishEngine.ts';
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

const PYTHON_REFERENCE_SNIPPET = `import cv2
import numpy as np
import mss
import chess
import chess.engine

engine = chess.engine.SimpleEngine.from_uci("stockfish_path")
board = chess.Board()

def detect_move_from_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    # استخراج مصفوفة 8x8 ومقارنة الإطار السابق بالحالي لتحديد النقلة
    return "e2e4"

def analyze_and_explain(uci_move):
    move = chess.Move.from_uci(uci_move)
    if move in board.legal_moves:
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=15))
        print(f"النقلة: {uci_move} | أفضل رد: {info['pv'][0]} | التقييم: {info['score'].white()}")`;

function isCapacitorNativeRuntime(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function parseJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error(`${fallbackError} (استجابة فارغة من الخادم: ${res.status})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    if (isCapacitorNativeRuntime() || rawText.trimStart().startsWith('<')) {
      throw new Error(
        'هذه الميزة السحابية تتطلب اتصالاً بخادم التطبيق، بينما يعمل محرك Stockfish والرؤية الحاسوبية محلياً دون خادم.'
      );
    }
    throw new Error(
      `استجاب الخادم بصيغة غير صالحة (ليست JSON). تأكد من تشغيل خادم التطبيق (${res.status}).`
    );
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
  const [scanError, setScanError] = useState<string | null>(null);
  const [opponentMoveOnly, setOpponentMoveOnly] = useState<boolean>(false);
  const [capturedPreview, setCapturedPreview] = useState<CapturedBoardPreview | null>(null);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  // Stockfish UCI State (Elo-driven automatic Search Depth)
  const [playerElo, setPlayerElo] = useState<number>(1600);
  const [autoDepthByElo, setAutoDepthByElo] = useState<boolean>(true);
  const [manualSearchDepth, setManualSearchDepth] = useState<number>(13);
  const searchDepth = autoDepthByElo
    ? Math.max(5, Math.min(18, Math.round(5 + ((Math.max(800, Math.min(2800, playerElo)) - 800) / 2000) * 13)))
    : manualSearchDepth;
  const [analysis, setAnalysis] = useState<StockfishAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const useLocalStockfishRef = useRef<boolean>(isCapacitorNativeRuntime());

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

  const [copiedPython, setCopiedPython] = useState<boolean>(false);

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
        setVoiceError('تعذر تشغيل ملف الصوت في المتصفح.');
      };
      setIsPlayingAudio(true);
      audio.play().catch(() => {
        setIsPlayingAudio(false);
      });
    },
    [stopAudioPlayback]
  );

  // Run Gemini Text Explanation + TTS Synthesis
  const triggerExplainAndSpeak = useCallback(
    async (
      targetAnalysis: StockfishAnalysisResult,
      moveCtx: { san: string; uci: string } | null
    ) => {
      setVoiceError(null);
      setIsGeneratingExplanation(true);
      try {
        const expRes = await fetch('/api/gemini/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          }),
        });
        const expData = await parseJsonResponse<{ explanation: string }>(
          expRes,
          'فشل توليد الشرح التحليلي.'
        );

        const text = expData.explanation;
        setExplanationText(text);
        setIsGeneratingExplanation(false);

        // Synthesize Arabic audio with Gemini TTS
        setIsSynthesizingAudio(true);
        const ttsRes = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: selectedVoice }),
        });
        const ttsData = await parseJsonResponse<{ audioBase64: string; mimeType?: string }>(
          ttsRes,
          'فشل تحويل الشرح إلى صوت.'
        );

        const url = `data:${ttsData.mimeType || 'audio/wav'};base64,${ttsData.audioBase64}`;
        setAudioDataUrl(url);
        playAudioUrl(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الشرح الصوتي.';
        setVoiceError(msg);
      } finally {
        setIsGeneratingExplanation(false);
        setIsSynthesizingAudio(false);
      }
    },
    [selectedVoice, playAudioUrl, playerElo]
  );

  // Run Stockfish 19 UCI analysis whenever FEN, searchDepth, playerElo, or autoDepthByElo changes
  const runStockfishAnalysis = useCallback(
    async (
      targetFen: string,
      depth: number,
      moveCtxForSpeech: { san: string; uci: string } | null
    ): Promise<StockfishAnalysisResult | null> => {
      if (analyzeAbortRef.current) {
        analyzeAbortRef.current.abort();
      }
      const controller = new AbortController();
      analyzeAbortRef.current = controller;

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        let typed: StockfishAnalysisResult;

        if (useLocalStockfishRef.current) {
          typed = await localStockfishEngine.analyze(
            targetFen,
            depth,
            3,
            playerElo,
            autoDepthByElo
          );
        } else {
          try {
            const res = await fetch('/api/stockfish/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fen: targetFen,
                depth,
                multiPv: 3,
                playerElo,
                autoDepthByElo,
              }),
              signal: controller.signal,
            });
            const contentType = res.headers.get('content-type') ?? '';
            if (!res.ok || !contentType.includes('application/json')) {
              throw new Error('BACKEND_UNAVAILABLE');
            }
            typed = await parseJsonResponse<StockfishAnalysisResult>(
              res,
              'فشل تحليل Stockfish.'
            );
          } catch (backendErr) {
            if ((backendErr as Error).name === 'AbortError') throw backendErr;
            // Fallback transparently to local WebView/WASM Stockfish worker
            useLocalStockfishRef.current = true;
            typed = await localStockfishEngine.analyze(
              targetFen,
              depth,
              3,
              playerElo,
              autoDepthByElo
            );
          }
        }

        if (controller.signal.aborted) return null;
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
        if ((err as Error).name === 'AbortError') return null;
        setAnalysisError(err instanceof Error ? err.message : 'تعذر الاتصال بمحرك Stockfish.');
        autoSpeakPendingRef.current = false;
        return null;
      } finally {
        if (analyzeAbortRef.current === controller) {
          setIsAnalyzing(false);
        }
      }
    },
    [autoDepthByElo, playerElo, triggerExplainAndSpeak]
  );

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
            timestamp: new Date().toLocaleTimeString('ar-EG', {
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
    [autoSpeak, moveSoundEnabled, runStockfishAnalysis, searchDepth, voiceCoachEnabled]
  );

  // Start Camera stream
  const startCameraStream = useCallback(async () => {
    setStreamError(null);
    stopMediaTracks();

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('المتصفح أو التطبيق لا يدعم واجهات التقاط الوسائط في هذا السياق.');
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
        await vid.play();
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
        ? 'تم رفض إذن الكاميرا. اسمح للتطبيق بالوصول إلى الكاميرا من إعدادات الهاتف ثم اضغط «إعادة المحاولة».'
        : errName === 'NotFoundError' || errName === 'DevicesNotFoundError'
        ? 'لم يتم العثور على كاميرا متصلة على هذا الجهاز.'
        : errName === 'NotReadableError'
        ? 'الكاميرا قيد الاستخدام حالياً بواسطة تطبيق آخر.'
        : rawMsg || 'تعذر الوصول إلى الكاميرا.';
      setStreamError(friendlyMsg);
      setIsStreaming(false);
    }
  }, [config.targetFps, stopMediaTracks]);

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
        setLastDetectedInfo(`تم رصد: ${san} (${uci}) · ثقة ${confidence}%`);
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

  const handleScanBoardFen = useCallback(async () => {
    unlockAudioContext();
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
      setScanError('لا يوجد إطار نشط حالياً. شغّل الكاميرا أو ارفع صورة أولاً.');
      return;
    }

    // Capture raw screen-space ROI (bottom half = player area; Black flip happens programmatically on the 8x8 matrix)
    const dataUrl = pipeline.captureRoiDataUrl(srcElem, srcW, srcH, roi, config.orientation, 640, true);
    if (!dataUrl) {
      setScanError('تعذر التقاط منطقة الرقعة (ROI).');
      return;
    }

    const capturedAt = new Date().toLocaleTimeString('ar-EG', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

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

    setIsScanningFen(true);
    try {
      const res = await fetch('/api/gemini/board-fen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: 'image/jpeg',
          playerColor: config.orientation,
        }),
      });
      const data = await parseJsonResponse<{
        fen: string;
        turn?: 'w' | 'b';
        screenMatrix?: BoardMatrix8x8;
        flippedForBlack?: boolean;
      }>(res, 'تعذر قراءة وضعية الرقعة.');

      let resolvedFen = data.fen;
      let resolvedTurn: 'w' | 'b' = data.turn === 'b' ? 'b' : 'w';
      let flippedForBlack = config.orientation === 'black';
      let detectedOpponentMove: { san: string; uci: string } | null = null;

      if (Array.isArray(data.screenMatrix) && data.screenMatrix.length === 8) {
        const matrixResult = analyzeBoardMatrixPerspective(
          data.screenMatrix,
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
      }

      const applied = applyCustomFen(resolvedFen, true);
      if (!applied) {
        throw new Error('تمت قراءة الوضعية لكنها لم تجتز التحقق القانوني للشطرنج.');
      }

      if (moveSoundEnabled) {
        playMoveTapSound(false);
      }

      const oppLabel = detectedOpponentMove ? ` · نقلة الخصم: ${detectedOpponentMove.san}` : '';
      const perspectiveLabel = flippedForBlack ? 'الأسود (مصفوفة مقلوبة)' : 'الأبيض (النصف السفلي)';
      setLastDetectedInfo(
        `تمت القراءة · ${perspectiveLabel}${oppLabel} · الدور: ${resolvedTurn === 'b' ? 'الأسود' : 'الأبيض'}`
      );

      // Immediately resolve Stockfish UCI best reply for the preview card
      const uciResult = await runStockfishAnalysis(
        resolvedFen,
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
        fen: resolvedFen,
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'فشلت قراءة الوضعية بالذكاء الاصطناعي.');
    } finally {
      setIsScanningFen(false);
    }
  }, [
    applyCustomFen,
    config.orientation,
    moveSoundEnabled,
    roi,
    runStockfishAnalysis,
    searchDepth,
    source,
  ]);

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

  const handleCopyPython = () => {
    navigator.clipboard.writeText(PYTHON_REFERENCE_SNIPPET);
    setCopiedPython(true);
    setTimeout(() => setCopiedPython(false), 1800);
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
        globalThis.localStorage?.clear();
        globalThis.sessionStorage?.clear();
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
      setTelemetryHistory([]);
      setCapturedPreview(null);
      setAudioDataUrl(null);
      setScanError(null);
      setVoiceError(null);
      setAnalysisError(null);
      stopAudioPlayback();

      setCacheNotice(
        clearedCount > 0
          ? `تم مسح الذاكرة المؤقتة (${clearedCount})`
          : 'تم مسح الذاكرة المؤقتة بنجاح'
      );
      void runStockfishAnalysis(chessRef.current.fen(), searchDepth, null);
    } catch {
      setCacheNotice('تم تنظيف ذاكرة التطبيق بنجاح');
    } finally {
      setIsClearingCache(false);
      globalThis.setTimeout(() => {
        setCacheNotice(null);
      }, 4000);
    }
  }, [runStockfishAnalysis, searchDepth, stopAudioPlayback]);

  return (
    <div className="relative min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Full-Height Vertical Background Artwork */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <img
          src="/assets/aistudio/FB_IMG_1795486450572_eb120a57.jpg"
          alt=""
          className="w-full h-full object-cover object-center opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0E14]/50 via-[#0B0E14]/25 to-[#0B0E14]/60" />
      </div>

      {/* Top Bar Contract: Single Row, 3 Zones */}
      <header className="sticky top-0 z-30 bg-[#0B0E14]/60 backdrop-blur-md border-b border-slate-700/50">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="#vision-stage"
            className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            <img
              src="/assets/aistudio/apple-touch-icon_f4ce301f.png"
              alt="شعار رَصْد الشطرنج"
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-amber-400/30 shrink-0"
            />
            <span>رَصْد الشطرنج</span>
          </a>

          {/* Zone 2: Concise Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <a
              href="#vision-stage"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              البث والرصد البصري
            </a>
            <a
              href="#board-stage"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              الرقعة وتحليل UCI
            </a>
            <a
              href="#profiler-stage"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              مقايضة الموارد
            </a>
            <a
              href="#architecture-reference"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              مرجع OpenCV و Python
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleToggleStream}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isStreaming
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
              }`}
            >
              {isStreaming ? 'إيقاف المراقبة الحية' : 'تشغيل المراقبة الحية'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Intro Strip (Compact, direct functional overview) */}
        <section className="flex flex-wrap items-end justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div className="max-w-2xl">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 leading-snug text-balance">
              رصد رقعة الشطرنج بالرؤية الحاسوبية ومحرك Stockfish عبر UCI
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed">
              التقط الرقعة من الكاميرا أو البث التفاعلي أو ارفع صورة، وعاين معالجة الحواف
              واستخراج مصفوفة <span className="font-mono">8×8</span>، مع تحليل Stockfish 19 الفوري
              والشرح الصوتي بالذكاء الاصطناعي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>
              حالة البث:{' '}
              <strong className={isStreaming ? 'text-emerald-400 font-medium' : 'text-slate-300 font-medium'}>
                {isStreaming ? '● رصد نشط' : 'متوقف'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums" dir="ltr">
              {config.resolution}px @ {config.targetFps} FPS
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums" dir="ltr">
              Depth {searchDepth}
            </span>
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => void handleClearAppCache()}
              disabled={isClearingCache}
              title="مسح ذاكرة التخزين المؤقتة للتطبيق وبيانات Service Worker والمحرك"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 disabled:opacity-50 disabled:pointer-events-none rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isClearingCache ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>{isClearingCache ? 'جاري المسح...' : 'مسح الذاكرة المؤقتة'}</span>
            </button>
            {cacheNotice && (
              <span className="text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-1 rounded-md">
                {cacheNotice}
              </span>
            )}
          </div>
        </section>

        {/* Primary 3-Zone Workspace Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
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
                setLastDetectedInfo('تمت معايرة الإطار المرجعي');
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
              scanError={scanError}
              onScanBoardFen={() => void handleScanBoardFen()}
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

          {/* Column 2: Synchronized Digital Board + Evaluation Bar */}
          <div id="board-stage" className="xl:col-span-4">
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

        {/* Architecture & Python Reference Implementation */}
        <section
          id="architecture-reference"
          className="border border-slate-700/50 bg-[#121722]/45 backdrop-blur-md rounded-xl overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-slate-100">
              هيكلة النظام والمرجع البرمجي (Python OpenCV + Stockfish UCI)
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="/api/download/app.zip"
                download="chess-vision-uci-app.zip"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-500 hover:bg-cyan-400 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل التطبيق (.zip)</span>
              </a>
              <button
                type="button"
                onClick={handleCopyPython}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0E14]/55 border border-slate-700/70 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {copiedPython ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ كود Python</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">
                  01. التقاط الإطارات والمعالجة الأولية
                </h3>
                <p className="text-slate-300">
                  تُحوّل الإطارات الملتقطة إلى التدرج الرمادي ثم يُطبّق مرشح{' '}
                  <span className="font-mono text-slate-100">GaussianBlur</span> لتقليل تشويش
                  الحساس قبل استخراج الحواف عبر <span className="font-mono text-slate-100">Canny</span>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">
                  02. مطابقة المصفوفة 8×8 مع النقلات القانونية
                </h3>
                <p className="text-slate-300">
                  تُقسّم منطقة الاهتمام (ROI) إلى 64 مربعاً لقياس تغيّر السطوع بين الإطارين
                  وربطه بمصفوفة <span className="font-mono text-slate-100">chess.Board</span>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">
                  03. مقايضة استهلاك الموارد وزمن الاستجابة
                </h3>
                <p className="text-slate-300">
                  مضاعفة دقة المسح من <span className="font-mono text-slate-100">256px</span> إلى{' '}
                  <span className="font-mono text-slate-100">800px</span> يزيد عدد البكسلات نحو 10
                  أضعاف، ما يضغط على ميزانية الإطار عند الترددات العالية إذا تجاوز زمن المعالجة
                  حد <span className="font-mono text-slate-100">1000 / FPS</span> ملي ثانية.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <pre
                dir="ltr"
                className="p-4 rounded-lg bg-[#070A10]/60 border border-slate-700/60 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed"
              >
                <code>{PYTHON_REFERENCE_SNIPPET}</code>
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
