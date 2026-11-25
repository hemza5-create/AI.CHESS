import React, { useEffect, useState } from 'react';
import {
  Camera,
  Loader2,
  ShieldCheck,
  X,
  CheckCircle2,
  Link2,
  Radio,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { BoardOrientation, CapturedBoardPreview } from '../types/chess.ts';

interface CapturePreviewPanelProps {
  isScanningFen: boolean;
  scanError: string | null;
  onScanBoardFen: () => void;
  autoScanPieces: boolean;
  onToggleAutoScanPieces: () => void;
  visionApiUrl: string;
  resolvedVisionEndpoint: string | null;
  onSaveVisionApiUrl: (url: string) => void;
  orientation: BoardOrientation;
  onChangeOrientation: (orientation: BoardOrientation) => void;
  opponentMoveOnly: boolean;
  onToggleOpponentMoveOnly: () => void;
  capturedPreview: CapturedBoardPreview | null;
  isAnalyzingBestMove: boolean;
  onClearCapturedPreview: () => void;
  onApplyBestMoveFromPreview: (uci: string) => void;
}

export const CapturePreviewPanel: React.FC<CapturePreviewPanelProps> = ({
  isScanningFen,
  scanError,
  onScanBoardFen,
  autoScanPieces,
  onToggleAutoScanPieces,
  visionApiUrl,
  resolvedVisionEndpoint,
  onSaveVisionApiUrl,
  orientation,
  onChangeOrientation,
  opponentMoveOnly,
  onToggleOpponentMoveOnly,
  capturedPreview,
  isAnalyzingBestMove,
  onClearCapturedPreview,
  onApplyBestMoveFromPreview,
}) => {
  const { t } = useLanguage();
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState(visionApiUrl);

  useEffect(() => {
    setEndpointDraft(visionApiUrl);
  }, [visionApiUrl]);

  return (
    <section
      aria-label={t.capturePreviewBestMoveBtn}
      className="border border-cyan-400/45 bg-[#0F1522]/25 backdrop-blur-sm rounded-xl p-3 sm:p-4 shadow-lg space-y-2.5 sm:space-y-3"
    >
      {scanError && (
        <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-lg border border-rose-400/60 bg-rose-950/75 text-xs sm:text-sm font-medium text-rose-100">
          {scanError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onScanBoardFen}
          disabled={isScanningFen}
          className="flex-1 min-w-[165px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-base font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors shadow-sm"
        >
          {isScanningFen ? (
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0" />
          ) : (
            <Camera className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          )}
          <span>
            {isScanningFen
              ? t.capturingPreviewBestMoveBtn
              : t.capturePreviewBestMoveBtn}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleAutoScanPieces}
          title={t.autoPlacePiecesTooltip}
          className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2.5 text-[11px] sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            autoScanPieces
              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-200'
              : 'border-slate-400/50 bg-slate-900/35 text-white hover:bg-slate-800/65'
          }`}
        >
          <Radio className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${autoScanPieces ? 'animate-pulse text-cyan-300' : ''}`} />
          <span>{t.autoPlacePiecesBtn}</span>
        </button>

        <button
          type="button"
          onClick={onToggleOpponentMoveOnly}
          title={t.opponentMoveOnlyTooltip}
          className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2.5 text-[11px] sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            opponentMoveOnly
              ? 'border-emerald-400/65 bg-emerald-500/20 text-emerald-200'
              : 'border-slate-400/50 bg-slate-900/35 text-white hover:bg-slate-800/65'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>{t.opponentMoveOnlyBtn}</span>
        </button>
      </div>

      {/* External Vision API Endpoint Bar */}
      <div className="rounded-lg border border-slate-400/40 bg-[#070B12]/30 px-2.5 py-1.5 sm:px-3 sm:py-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] sm:text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-slate-100 font-medium shrink-0">{t.activeEndpointLabel}</span>
            <code
              dir="ltr"
              className="font-mono text-cyan-200 truncate"
              title={resolvedVisionEndpoint ?? ''}
            >
              {resolvedVisionEndpoint ?? '—'}
            </code>
            {autoScanPieces && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 font-semibold shrink-0">
                {t.autoPlaceActiveStatus}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowApiConfig((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-cyan-200 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/45 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Link2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>{showApiConfig ? t.hideUrl : t.visionApiEndpointBtn}</span>
          </button>
        </div>

        {showApiConfig && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveVisionApiUrl(endpointDraft);
              setShowApiConfig(false);
            }}
            className="pt-2 border-t border-slate-600/50 space-y-1.5"
          >
            <label
              htmlFor="vision-api-endpoint-input"
              className="block text-[11px] sm:text-xs font-medium text-slate-200"
            >
              {t.visionApiEndpointLabel}
            </label>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <input
                id="vision-api-endpoint-input"
                type="text"
                dir="ltr"
                value={endpointDraft}
                onChange={(e) => setEndpointDraft(e.target.value)}
                placeholder={t.visionApiPlaceholder}
                className="flex-1 min-w-[170px] bg-[#05080E] border border-slate-500/70 rounded px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded transition-colors shrink-0"
              >
                {t.saveEndpointBtn}
              </button>
              {visionApiUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setEndpointDraft('');
                    onSaveVisionApiUrl('');
                  }}
                  className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-500/60 rounded transition-colors shrink-0"
                >
                  {t.defaultServerBtn}
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-sm">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-white font-semibold">{t.yourZoneLabel}</span>
          <div className="inline-flex rounded-md border border-slate-400/50 bg-[#05080E]/40 p-0.5">
            <button
              type="button"
              onClick={() => onChangeOrientation('white')}
              className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded text-[11px] sm:text-sm font-bold transition-colors ${
                orientation === 'white'
                  ? 'bg-white text-slate-950'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              {t.whiteSideBtn}
            </button>
            <button
              type="button"
              onClick={() => onChangeOrientation('black')}
              className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded text-[11px] sm:text-sm font-bold transition-colors ${
                orientation === 'black'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              {t.blackFlippedBtn}
            </button>
          </div>
        </div>

        <span className="text-slate-200 font-medium">
          {orientation === 'black' ? t.blackPerspectiveHint : t.whitePerspectiveHint}
        </span>
      </div>

      {/* Captured Preview & Extracted Best UCI Move Result */}
      {capturedPreview && (
        <div className="pt-2.5 sm:pt-3 border-t border-slate-600/60 flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3.5">
          <img
            src={capturedPreview.imageUrl}
            alt={t.capturedPreviewAlt}
            className="w-16 h-16 sm:w-28 sm:h-28 rounded-lg object-cover border-2 border-cyan-400/60 shrink-0 bg-slate-950 shadow-md"
          />
          <div className="flex-1 min-w-0 w-full space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-base font-bold text-cyan-200">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300 shrink-0" />
                <span>{t.capturedPreviewTitle(capturedPreview.capturedAt)}</span>
              </span>
              <button
                type="button"
                onClick={onClearCapturedPreview}
                aria-label={t.closePreviewAria}
                className="p-1 sm:p-1.5 text-slate-200 hover:text-white hover:bg-slate-800 rounded-md"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <div className="text-[11px] sm:text-sm text-slate-100 font-medium flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>
                {capturedPreview.flippedForBlack
                  ? t.previewBlackFlipped
                  : t.previewWhiteBottom}
              </span>
              {capturedPreview.detectedOpponentMove && (
                <span
                  className="text-amber-200 font-mono font-bold bg-amber-500/15 border border-amber-400/40 px-1.5 py-0.5 rounded"
                  dir="ltr"
                >
                  {t.opponentMoveLabel} {capturedPreview.detectedOpponentMove.san} (
                  {capturedPreview.detectedOpponentMove.uci})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              {isAnalyzingBestMove && !capturedPreview.bestMoveUci ? (
                <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-100">
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-cyan-300" />
                  <span>{t.generatingUciReply}</span>
                </span>
              ) : capturedPreview.bestMoveUci ? (
                <>
                  <div className="text-xs sm:text-base font-semibold text-white">
                    {t.bestReplyUciLabel}{' '}
                    <strong
                      className="font-mono text-sm sm:text-lg font-bold text-emerald-300"
                      dir="ltr"
                    >
                      {capturedPreview.bestMoveSan ?? capturedPreview.bestMoveUci} (
                      {capturedPreview.bestMoveUci})
                    </strong>
                    {capturedPreview.evaluationLabel && (
                      <span
                        className="ms-1.5 sm:ms-2 text-[11px] sm:text-sm font-mono font-semibold text-slate-200"
                        dir="ltr"
                      >
                        [{capturedPreview.evaluationLabel}]
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      capturedPreview.bestMoveUci &&
                      onApplyBestMoveFromPreview(capturedPreview.bestMoveUci)
                    }
                    className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-sm font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-md transition-colors shrink-0"
                  >
                    {t.applyMoveBtn}
                  </button>
                </>
              ) : (
                <span className="text-[11px] sm:text-sm font-medium text-slate-200">
                  {t.positionReadyLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
