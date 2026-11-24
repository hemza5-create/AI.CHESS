import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Copy, Check, Download } from 'lucide-react';
import { LiveVisionStage } from './components/LiveVisionStage';
import { DigitalBoard } from './components/DigitalBoard';
import { AnalysisAndVoicePanel } from './components/AnalysisAndVoicePanel';
import { ResourceTradeoffConsole } from './components/ResourceTradeoffConsole';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OpenCvChessPipeline, computeFitRoi } from './vision/opencvPipeline';
import { renderVirtualBoardToCanvas, SAMPLE_GAMES } from './vision/virtualBoardRenderer';
import { playMoveTapSound, unlockAudioContext } from './utils/soundEffects';
import type {
  CaptureSource,
  FrameTelemetry,
  MoveRecord,
  RoiQuad,
  SquareMetric,
  StockfishAnalysisResult,
  TtsVoiceName,
  VisionConfig,
  VisionViewMode,
} from './types/chess';

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
        const expData = await expRes.json();
        if (!expRes.ok) {
          throw new Error(expData.error || 'فشل توليد الشرح التحليلي.');
        }

        const text = expData.explanation as string;
        setExplanationText(text);
        setIsGeneratingExplanation(false);

        // Synthesize Arabic audio with Gemini TTS
        setIsSynthesizingAudio(true);
        const ttsRes = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: selectedVoice }),
        });
        const ttsData = await ttsRes.json();
        if (!ttsRes.ok) {
          throw new Error(ttsData.error || 'فشل تحويل الشرح إلى صوت.');
        }

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
    async (targetFen: string, depth: number, moveCtxForSpeech: { san: string; uci: string } | null) => {
      if (analyzeAbortRef.current) {
        analyzeAbortRef.current.abort();
      }
      const controller = new AbortController();
      analyzeAbortRef.current = controller;

      setIsAnalyzing(true);
      setAnalysisError(null);

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
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'فشل تحليل Stockfish.');
        }
        const typed = data as StockfishAnalysisResult;
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
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setAnalysisError(err instanceof Error ? err.message : 'تعذر الاتصال بمحرك Stockfish.');
        autoSpeakPendingRef.current = false;
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

  // Start Camera or Screen Share stream
  const startExternalStream = useCallback(
    async (targetSource: 'camera' | 'screen') => {
      setStreamError(null);
      stopMediaTracks();

      try {
        if (!navigator.mediaDevices) {
          throw new Error('المتصفح لا يدعم واجهات التقاط الوسائط.');
        }

        const stream =
          targetSource === 'camera'
            ? await navigator.mediaDevices.getUserMedia({
                video: {
                  facingMode: 'environment',
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: config.targetFps, max: 60 },
                },
                audio: false,
              })
            : await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: config.targetFps, max: 60 } },
                audio: false,
              });

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

        // Listen for user ending screen share from browser chrome
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
        const msg =
          err instanceof Error
            ? err.message
            : 'تعذر الوصول إلى الكاميرا أو مشاركة الشاشة.';
        setStreamError(`تعذر بدء البث: ${msg}`);
        setIsStreaming(false);
      }
    },
    [config.targetFps, stopMediaTracks]
  );

  // Switch capture source
  const handleSelectSource = useCallback(
    async (nextSource: CaptureSource) => {
      setStreamError(null);
      setScanError(null);
      setSource(nextSource);
      pipelineRef.current?.resetBaseline();

      if (nextSource === 'virtual') {
        stopMediaTracks();
        setRoi(DEFAULT_VIRTUAL_ROI);
        setIsStreaming(true);
      } else if (nextSource === 'camera' || nextSource === 'screen') {
        setRoi([
          { x: 0.22, y: 0.22 },
          { x: 0.78, y: 0.22 },
          { x: 0.78, y: 0.78 },
          { x: 0.22, y: 0.78 },
        ]);
        await startExternalStream(nextSource);
      } else {
        stopMediaTracks();
        setIsStreaming(false);
      }
    },
    [startExternalStream, stopMediaTracks]
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
      } else if (source === 'camera' || source === 'screen') {
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
        chessRef.current.fen()
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
    (rawFen: string): boolean => {
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
        void runStockfishAnalysis(canonical, searchDepth, null);
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
    } else if (source === 'camera' || source === 'screen') {
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

    const dataUrl = pipeline.captureRoiDataUrl(srcElem, srcW, srcH, roi, config.orientation, 640);
    if (!dataUrl) {
      setScanError('تعذر التقاط منطقة الرقعة (ROI).');
      return;
    }

    setIsScanningFen(true);
    try {
      const res = await fetch('/api/gemini/board-fen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر قراءة وضعية الرقعة.');
      }

      const applied = applyCustomFen(data.fen as string);
      if (!applied) {
        throw new Error('تمت قراءة الوضعية لكنها لم تجتز التحقق القانوني للشطرنج.');
      }

      if (moveSoundEnabled) {
        playMoveTapSound(false);
      }
      setLastDetectedInfo(
        `تمت قراءة الوضعية · الدور: ${data.turn === 'b' ? 'الأسود' : 'الأبيض'}`
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'فشلت قراءة الوضعية بالذكاء الاصطناعي.');
    } finally {
      setIsScanningFen(false);
    }
  }, [applyCustomFen, config.orientation, moveSoundEnabled, roi, source]);

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
      if (source === 'camera' || source === 'screen') {
        stopMediaTracks();
      }
    } else {
      if (source === 'camera' || source === 'screen') {
        void startExternalStream(source);
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

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Single Row, 3 Zones */}
      <header className="sticky top-0 z-30 bg-[#0B0E14]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="#vision-stage"
            className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            رَصْد الشطرنج
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
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Intro Strip (Compact, direct functional overview) */}
        <section className="flex flex-wrap items-end justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div className="max-w-2xl">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 leading-snug text-balance">
              رصد رقعة الشطرنج بالرؤية الحاسوبية ومحرك Stockfish عبر UCI
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed">
              التقط الرقعة من الكاميرا أو مشاركة الشاشة أو البث التفاعلي، وعاين معالجة الحواف
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
                  (source === 'camera' || source === 'screen') &&
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
          className="border border-slate-800 bg-[#121722] rounded-xl overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-800">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0E14] border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
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
                <p className="text-slate-400">
                  تُحوّل الإطارات الملتقطة إلى التدرج الرمادي ثم يُطبّق مرشح{' '}
                  <span className="font-mono text-slate-200">GaussianBlur</span> لتقليل تشويش
                  الحساس قبل استخراج الحواف عبر <span className="font-mono text-slate-200">Canny</span>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">
                  02. مطابقة المصفوفة 8×8 مع النقلات القانونية
                </h3>
                <p className="text-slate-400">
                  تُقسّم منطقة الاهتمام (ROI) إلى 64 مربعاً لقياس تغيّر السطوع بين الإطارين
                  وربطه بمصفوفة <span className="font-mono text-slate-200">chess.Board</span>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">
                  03. مقايضة استهلاك الموارد وزمن الاستجابة
                </h3>
                <p className="text-slate-400">
                  مضاعفة دقة المسح من <span className="font-mono text-slate-200">256px</span> إلى{' '}
                  <span className="font-mono text-slate-200">800px</span> يزيد عدد البكسلات نحو 10
                  أضعاف، ما يضغط على ميزانية الإطار عند الترددات العالية إذا تجاوز زمن المعالجة
                  حد <span className="font-mono text-slate-200">1000 / FPS</span> ملي ثانية.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <pre
                dir="ltr"
                className="p-4 rounded-lg bg-[#070A10] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed"
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
