import React, { useRef, useState } from 'react';
import {
  Camera,
  Monitor,
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
} from '../types/chess';
import { SAMPLE_GAMES } from '../vision/virtualBoardRenderer';

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
  scanError: string | null;
  onScanBoardFen: () => void;
}

const DEFAULT_CORNER_LABELS = ['أعلى يسار', 'أعلى يمين', 'أسفل يمين', 'أسفل يسار'];

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
  scanError,
  onScanBoardFen,
}) => {
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
    <section className="flex flex-col border border-slate-800 bg-[#121722] rounded-xl overflow-hidden">
      {/* Source & Stream Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-[#0B0E14] rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => onSelectSource('virtual')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'virtual'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>بث تفاعلي</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSource('camera')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'camera'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>الكاميرا</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSource('screen')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'screen'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>مشاركة الشاشة</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              source === 'image'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>رفع صورة</span>
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
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                isStreaming
                  ? 'bg-rose-600/90 hover:bg-rose-500 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
              }`}
            >
              {isStreaming ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>إيقاف الالتقاط</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>بدء الالتقاط</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Vision Pipeline Layer Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0E131D] border-b border-slate-800">
        <div className="flex items-center gap-1">
          {(
            [
              ['original', 'البث الأصلي + ROI'],
              ['grayscale', 'تدرج رمادي (Blur)'],
              ['canny', 'حواف Canny'],
              ['heatmap', 'فروقات المربعات 8×8'],
            ] as [VisionViewMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeViewMode(mode)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === mode
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onScanBoardFen}
            disabled={isScanningFen}
            title="قراءة وضعية القطع الحالية من الإطار المحدد ومزامنة الرقعة الرقمية فوراً"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-950 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:pointer-events-none rounded transition-colors whitespace-nowrap shrink-0"
          >
            {isScanningFen ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ScanSearch className="w-3.5 h-3.5" />
            )}
            <span>{isScanningFen ? 'جاري القراءة...' : 'مسح الوضعية (AI)'}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMoveSound}
            title="تفعيل أو كتم صوت التكة عند اكتشاف حركة قطعة"
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
              moveSoundEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {moveSoundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>صوت الرصد</span>
          </button>
          <button
            type="button"
            onClick={onCalibrateBaseline}
            title="حفظ الإطار الحالي كمرجع لرصد النقلات القادمة"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span>معايرة المرجع</span>
          </button>
          <button
            type="button"
            onClick={onResetRoi}
            title="إعادة ضبط زوايا الرقعة الأربع"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>ضبط ROI</span>
          </button>
        </div>
      </div>

      {/* Live Video / Canvas Viewport */}
      <div className="p-4">
        {source !== 'virtual' && (
          <div className="mb-3 px-3 py-2 rounded-md border border-cyan-500/25 bg-cyan-950/20 text-[11px] text-slate-300 leading-relaxed">
            اسحب النقاط السماوية الأربع على حدود مربعات الرقعة الـ <span className="font-mono">8×8</span>، وإذا كانت المباراة جارية بالفعل اضغط{' '}
            <strong className="text-cyan-300 font-semibold">«مسح الوضعية (AI)»</strong> لقراءة القطع ومزامنة أفضل نقلة فوراً.
          </div>
        )}

        {(errorMsg || scanError) && (
          <div className="mb-3 px-3 py-2 rounded-md border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
            {scanError ?? errorMsg}
          </div>
        )}

        <div
          ref={stageRef}
          dir="ltr"
          onPointerMove={handlePointerMoveStage}
          onPointerUp={handlePointerUpStage}
          onPointerLeave={handlePointerUpStage}
          className="relative w-full aspect-square max-w-[520px] mx-auto bg-[#070A10] border border-slate-800 rounded-lg overflow-hidden select-none"
        >
          {/* Underlying raw video element (camera/screen) */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 w-full h-full object-contain ${
              (source === 'camera' || source === 'screen') && viewMode === 'original'
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none'
            }`}
          />

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
            alt="صورة الرقعة المرفوعة"
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
                  <g key={ln.i} stroke="rgba(6, 182, 212, 0.28)" strokeWidth="0.22">
                    <line x1={ln.vx1} y1={ln.vy1} x2={ln.vx2} y2={ln.vy2} />
                    <line x1={ln.hx1} y1={ln.hy1} x2={ln.hx2} y2={ln.hy2} />
                  </g>
                ))}
              <polygon
                points={roiPolygonPoints}
                fill="rgba(6, 182, 212, 0.05)"
                stroke="#06B6D4"
                strokeWidth="0.45"
                strokeDasharray="1.5 1"
              />
            </svg>
          )}

          {viewMode === 'original' &&
            roi.map((pt: Point2D, idx: number) => (
              <button
                key={idx}
                type="button"
                aria-label={`مقبض زاوية ${DEFAULT_CORNER_LABELS[idx]}`}
                onPointerDown={(e) => handlePointerDownCorner(idx, e)}
                style={{
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cyan-400/90 border-2 border-slate-950 shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
            ))}

          {/* Live Telemetry Overlay Strip (bottom inside frame with scrim) */}
          <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent flex items-center justify-between text-[11px] font-mono text-slate-200 pointer-events-none">
            <span>
              {telemetry
                ? `${telemetry.resolution}px · ${telemetry.totalMs.toFixed(1)}ms · ${telemetry.actualFps.toFixed(0)} FPS`
                : 'بانتظار الإطار'}
            </span>
            <span className="text-cyan-300">
              {lastDetectedInfo ?? (isStreaming ? 'رصد نشط' : 'متوقف')}
            </span>
          </div>
        </div>

        {/* Virtual Source Interactive Controls (only shown when source === 'virtual') */}
        {source === 'virtual' && (
          <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="preset-select" className="text-xs text-slate-400 whitespace-nowrap">
                سيناريو البث:
              </label>
              <select
                id="preset-select"
                value={selectedPresetId}
                onChange={(e) => onSelectPreset(e.target.value)}
                className="bg-[#0B0E14] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {SAMPLE_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleLightingNoise}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  simulateLightingNoise
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                تشويش إضاءة الكاميرا
              </button>

              <button
                type="button"
                onClick={onResetVirtualGame}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                تصفير البث
              </button>

              <button
                type="button"
                onClick={onStepVirtualMove}
                disabled={presetStepIndex >= activePreset.moves.length}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <StepForward className="w-3.5 h-3.5" />
                <span>
                  تنفيذ نقلة في البث ({presetStepIndex}/{activePreset.moves.length})
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
