import React, { useState } from 'react';
import { Smartphone, X, Copy, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

export const PWAInstallButton: React.FC = () => {
  const { t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) setShowGuide(true);
    } else {
      setShowGuide(true);
    }
  };

  const currentUrl = globalThis.location?.origin ?? '';

  const handleCopyUrl = () => {
    if (!currentUrl) return;
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const steps = isIOS ? t.pwaIosSteps : t.pwaAndroidSteps;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-sm font-bold text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 rounded-md transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span>{t.pwaInstallButton}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-600 bg-[#121722] p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="pwa-install-title" className="text-base font-bold">
                {isIOS ? t.pwaIosTitle : t.pwaAndroidTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={t.pwaClose}
                className="p-1.5 text-slate-200 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="text-sm text-slate-100 space-y-2 list-decimal list-inside leading-relaxed">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            {currentUrl && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[#0B0E14] border border-slate-600">
                <code dir="ltr" className="text-xs font-mono text-cyan-200 truncate">
                  {currentUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded whitespace-nowrap shrink-0"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{t.pwaCopiedLink}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t.pwaCopyLink}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors"
            >
              {t.pwaClose}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
