import React, { useRef, useState } from 'react';
import {
  Camera,
  Play,
  Square,
  Upload,
  Crosshair,
  RotateCcw,
  StepForward,
  Sparkles,
  Volume2,
  VolumeX,
  ScanSearch,
  Loader2,
} from 'lucide-react';
import type {
  CaptureSource,
  Point2D,
  RoiQuad,
  VisionViewMode,
  FrameTelemetry,
} from '../types/chess.ts';
import { SAMPLE_GAMES } from '../vision/virtualBoardRenderer.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

interface LiveVisionStageProps {
  source: CaptureSource;
  isStreaming: boolean;
  viewMode: VisionViewMode;
  roi: RoiQuad;
  telemetry: FrameTelemetry | null;
  lastDetectedInfo: string | null;
  errorMsg: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  virtualCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  uploadedImgRef: React.RefObject<HTMLImageElement | null>;
  processedCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectedPresetId: string;
  presetStepIndex: number;
  simulateLightingNoise: boolean;
  onSelectSource: (src: CaptureSource) => void;
  onToggleStream: () => void;
  onChangeViewMode: (mode: VisionViewMode) => void;
  onUpdateRoi: (nextRoi: RoiQuad) => void;
  onResetRoi: () => void;
  onCalibrateBaseline: () => void;
  onUploadImageFile: (file: File) => void;
  onSelectPreset: (id: string) => void;
  onStepVirtualMove: () => void;
  onResetVirtualGame: () => void;
  onToggleLightingNoise: () => void;
  moveSoundEnabled: boolean;
  onToggleMoveSound: () => void;
  isScanningFen: boolean;
  onScanBoardFen: () => void;
}

export const LiveVisionStage: React.FC<LiveVisionStageProps> = ({
  source,
  isStreaming,
  viewMode,
  roi,
  telemetry,
  lastDetectedInfo,
  errorMsg,
  videoRef,
  virtualCanvasRef,
  uploadedImgRef,
  processedCanvasRef,
  selectedPresetId,
  presetStepIndex,
  simulateLightingNoise,
  onSelectSource,
  onToggleStream,
  onChangeViewMode,
  onUpdateRoi,
  onResetRoi,
  onCalibrateBaseline,
  onUploadImageFile,
  onSelectPreset,
  onStepVirtualMove,
  onResetVirtualGame,
  onToggleLightingNoise,
  moveSoundEnabled,
  onToggleMoveSound,
  isScanningFen,
  onScanBoardFen,
}) => {
  const { t } = useLanguage();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);

  const activePreset = SAMPLE_GAMES.find((g) => g.id === selectedPresetId) ?? SAMPLE_GAMES[0];

  const handlePointerDownCorner = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingCorner(idx);
  };

  const handlePointerMoveStage = (e: React.PointerEvent) => {
    if (draggingCorner === null || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    const updated: RoiQuad = [...roi] as RoiQuad;
    updated[draggingCorner] = { x: nx, y: ny };
    onUpdateRoi(updated);
  };

  const handlePointerUpStage = () => {
    if (draggingCorner !== null) {
      setDraggingCorner(null);
    }
  };

  const roiPolygonPoints = roi.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
  const [tl, tr, br, bl] = roi;
  const gridLines = [1, 2, 3, 4, 5, 6, 7].map((i) => {
    const t = i / 8;
    const vx1 = (tl.x + (tr.x - tl.x) * t) * 100;
    const vy1 = (tl.y + (tr.y - tl.y) * t) * 100;
    const vx2 = (bl.x + (br.x - bl.x) * t) * 100;
    const vy2 = (bl.y + (br.y - bl.y) * t) * 100;
    const hx1 = (tl.x + (bl.x - tl.x) * t) * 100;
    const hy1 = (tl.y + (bl.y - tl.y) * t) * 100;
    const hx2 = (tr.x + (br.x - tr.x) * t) * 100;
    const hy2 = (tr.y + (br.y - tr.y) * t) * 100;
    return { i, vx1, vy1, vx2, vy2, hx1, hy1, hx2, hy2 };
  });

  return (
    <section className="flex flex-col border border-slate-500/45 bg-[#0F1522]/55 backdrop-blur-md rounded-xl overflow-hidden shadow-lg">
      {/* Source & Stream Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3.5 border-b border-slate-500/45 bg-[#0B0E14]/45">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#070A10]/65 rounded-lg border border-slate-500/50">
          <button
            type="button"
            onClick={() => onSelectSource('virtual')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'virtual'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:text-white hover:bg-slate-800/75'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.sourceVirtual}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSource('camera')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'camera'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:text-white hover:bg-slate-800/75'
            }`}
          >
            <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.sourceCamera}</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'image'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-100 hover:text-white hover:bg-slate-800/75'
            }`}
          >
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.sourceImage}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadImageFile(file);
            }}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {source !== 'image' && (
            <button
              type="button"
              onClick={onToggleStream}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold rounded-md transition-colors whitespace-nowrap shrink-0 shadow-sm ${
                isStreaming
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
              }`}
            >
              {isStreaming ? (
                <>
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{t.stopCapture}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{t.startCapture}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Vision Pipeline Layer Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-[#0A0F1A]/55 border-b border-slate-500/45">
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {(
            [
              ['original', t.viewOriginal],
              ['grayscale', t.viewGrayscale],
              ['canny', t.viewCanny],
              ['heatmap', t.viewHeatmap],
            ] as [VisionViewMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeViewMode(mode)}
              className={`px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === mode
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/60'
                  : 'text-slate-100 hover:text-white bg-slate-900/45 border border-slate-700/50 hover:border-slate-500/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onScanBoardFen}
            disabled={isScanningFen}
            title={t.scanAiTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:pointer-events-none rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {isScanningFen ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            ) : (
              <ScanSearch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
            <span>{isScanningFen ? t.scanningAiBtn : t.scanAiBtn}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMoveSound}
            title={t.detectionSoundTooltip}
            className={`inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              moveSoundEnabled
                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                : 'border-slate-600 bg-slate-900/55 text-slate-100 hover:text-white'
            }`}
          >
            {moveSoundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
            <span>{t.detectionSoundBtn}</span>
          </button>
          <button
            type="button"
            onClick={onCalibrateBaseline}
            title={t.calibrateBaselineTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/65 hover:bg-slate-800 border border-slate-600/70 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300" />
            <span>{t.calibrateBaselineBtn}</span>
          </button>
          <button
            type="button"
            onClick={onResetRoi}
            title={t.resetRoiTooltip}
            className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/65 hover:bg-slate-800 border border-slate-600/70 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t.resetRoiBtn}</span>
          </button>
        </div>
      </div>

      {/* Live Video / Canvas Viewport */}
      <div className="p-2.5 sm:p-4">
        {source !== 'virtual' && (
          <div className="mb-3 px-3.5 py-2.5 rounded-lg border border-cyan-400/45 bg-[#071520]/70 text-xs sm:text-sm text-slate-100 leading-relaxed">
            {t.roiGuideBefore}{' '}
            <strong className="text-cyan-300 font-bold">«{t.scanAiBtn}»</strong>{' '}
            {t.roiGuideAfter}
          </div>
        )}

        {errorMsg && (
          <div className="mb-3 px-3.5 py-2.5 rounded-lg border border-rose-400/60 bg-rose-950/75 text-sm font-medium text-rose-100 flex flex-wrap items-center justify-between gap-2">
            <span>{errorMsg}</span>
            {source === 'camera' && (
              <button
                type="button"
                onClick={() => void onSelectSource('camera')}
                className="px-3 py-1.5 rounded-md bg-rose-500/35 hover:bg-rose-500/50 border border-rose-300/60 text-white text-xs sm:text-sm font-bold whitespace-nowrap shrink-0"
              >
                {t.retryBtn}
              </button>
            )}
          </div>
        )}

        <div
          ref={stageRef}
          dir="ltr"
          onPointerMove={handlePointerMoveStage}
          onPointerUp={handlePointerUpStage}
          onPointerLeave={handlePointerUpStage}
          className="relative w-full aspect-square max-w-[330px] sm:max-w-[520px] mx-auto bg-[#070A10]/45 border border-slate-500/60 rounded-lg overflow-hidden select-none"
        >
          {/* Underlying raw video element (camera) */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 w-full h-full object-contain ${
              source === 'camera' && isStreaming && viewMode === 'original'
                ? 'opacity-100'
                : 'hidden'
            }`}
          />

          {source === 'camera' && !isStreaming && viewMode === 'original' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-[#070A10]/65 text-slate-100">
              <Camera className="w-11 h-11 text-cyan-300" />
              <span className="text-sm sm:text-base font-semibold text-white">
                {t.cameraPausedMsg}
              </span>
            </div>
          )}

          {/* Underlying virtual chessboard stream canvas */}
          <canvas
            ref={virtualCanvasRef}
            width={640}
            height={640}
            className={`absolute inset-0 w-full h-full object-contain ${
              source === 'virtual' && viewMode === 'original'
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none'
            }`}
          />

          {/* Underlying uploaded static image */}
          <img
            ref={uploadedImgRef}
            alt={t.uploadedImageAlt}
            referrerPolicy="no-referrer"
            className={`absolute inset-0 w-full h-full object-contain ${
              source === 'image' && viewMode === 'original'
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none'
            }`}
          />

          {/* OpenCV Processed Output Canvas (Grayscale / Canny / Heatmap) */}
          <canvas
            ref={processedCanvasRef}
            className={`absolute inset-0 w-full h-full object-contain ${
              viewMode !== 'original' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          />

          {/* 4-Corner ROI Calibration Overlay + 8x8 Alignment Grid (Visible in Original View) */}
          {viewMode === 'original' && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {source !== 'virtual' &&
                gridLines.map((ln) => (
                  <g key={ln.i} stroke="rgba(6, 182, 212, 0.35)" strokeWidth="0.25">
                    <line x1={ln.vx1} y1={ln.vy1} x2={ln.vx2} y2={ln.vy2} />
                    <line x1={ln.hx1} y1={ln.hy1} x2={ln.hx2} y2={ln.hy2} />
                  </g>
                ))}
              <polygon
                points={roiPolygonPoints}
                fill="rgba(6, 182, 212, 0.05)"
                stroke="#22D3EE"
                strokeWidth="0.5"
                strokeDasharray="1.5 1"
              />
            </svg>
          )}

          {viewMode === 'original' &&
            roi.map((pt: Point2D, idx: number) => (
              <button
                key={idx}
                type="button"
                aria-label={`${t.cornerHandlePrefix} ${t.cornerLabels[idx]}`}
                onPointerDown={(e) => handlePointerDownCorner(idx, e)}
                style={{
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-cyan-400 border-2 border-slate-950 shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
            ))}

          {/* Live Telemetry Overlay Strip (bottom inside frame with high-contrast scrim) */}
          <div className="absolute inset-x-0 bottom-0 px-2.5 sm:px-3.5 py-1.5 sm:py-2.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex items-center justify-between gap-2 text-[10px] sm:text-sm font-mono font-semibold text-white pointer-events-none">
            <span>
              {telemetry
                ? `${telemetry.resolution}px · ${telemetry.totalMs.toFixed(1)}ms · ${telemetry.actualFps.toFixed(0)} FPS`
                : t.waitingForFrame}
            </span>
            <span className="text-cyan-200 truncate">
              {lastDetectedInfo ?? (isStreaming ? t.activeDetection : t.pausedLabel)}
            </span>
          </div>
        </div>

        {/* Virtual Source Interactive Controls (only shown when source === 'virtual') */}
        {source === 'virtual' && (
          <div className="mt-2.5 sm:mt-3.5 pt-2.5 sm:pt-3.5 border-t border-slate-600/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <label htmlFor="preset-select" className="text-[11px] sm:text-sm font-semibold text-slate-100 whitespace-nowrap">
                {t.virtualScenarioLabel}
              </label>
              <select
                id="preset-select"
                value={selectedPresetId}
                onChange={(e) => onSelectPreset(e.target.value)}
                className="bg-[#070B12] border border-slate-500/70 rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-medium text-white focus:outline-none focus:border-cyan-400"
              >
                {SAMPLE_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {t.presetNames[g.id] ?? g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onToggleLightingNoise}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  simulateLightingNoise
                    ? 'border-amber-400/65 bg-amber-500/20 text-amber-200'
                    : 'border-slate-500/70 bg-slate-900/60 text-slate-100 hover:text-white'
                }`}
              >
                {t.lightingNoiseBtn}
              </button>

              <button
                type="button"
                onClick={onResetVirtualGame}
                className="px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-semibold text-slate-100 hover:text-white bg-slate-900/70 hover:bg-slate-800 border border-slate-600/70 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {t.resetStreamBtn}
              </button>

              <button
                type="button"
                onClick={onStepVirtualMove}
                disabled={presetStepIndex >= activePreset.moves.length}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-sm font-bold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:pointer-events-none text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <StepForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>
                  {t.stepVirtualMoveBtn(presetStepIndex, activePreset.moves.length)}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
