import React, { useState } from 'react';
import { Smartphone, X, Copy, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
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

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>تثبيت كتطبيق أندرويد</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#121722] p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="pwa-install-title" className="text-sm font-semibold">
                {isIOS ? 'تثبيت التطبيق على iPhone / iPad' : 'تثبيت التطبيق مباشرة على أندرويد (PWA)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="إغلاق"
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>افتح الرابط في متصفح Safari على جهازك.</li>
                <li>اضغط على زر المشاركة (Share) في شريط المتصفح.</li>
                <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
              </ol>
            ) : (
              <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>افتح الرابط المباشر للتطبيق في متصفح Chrome على هاتف أندرويد.</li>
                <li>اضغط على قائمة المتصفح (⋮) في الأعلى ثم اختر «تثبيت التطبيق» (Install app).</li>
                <li>سيُثبّت «رَصْد الشطرنج» كتطبيق مستقل بأيقونة على الشاشة الرئيسية مع وصول كامل للكاميرا.</li>
              </ol>
            )}

            {currentUrl && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0B0E14] border border-slate-800">
                <code dir="ltr" className="text-[11px] font-mono text-cyan-300 truncate">
                  {currentUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded whitespace-nowrap shrink-0"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>نسخ الرابط</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </>
  );
};
