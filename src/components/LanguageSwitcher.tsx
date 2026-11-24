import React, { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/translations.ts';

export const LanguageSwitcher: React.FC = () => {
  const { language, meta, t, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.switchLanguageAria}
        title={t.switchLanguageAria}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-cyan-200 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Globe className="w-4 h-4 text-cyan-300 shrink-0" />
        <span>{meta.nativeName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-cyan-200 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.languageLabel}
          className={`absolute top-full mt-2 z-50 min-w-[184px] rounded-xl border border-slate-500/65 bg-[#0F1522]/95 backdrop-blur-md p-1.5 shadow-2xl ${
            meta.dir === 'rtl' ? 'left-0' : 'right-0'
          }`}
        >
          {SUPPORTED_LANGUAGES.map((item) => {
            const isActive = item.code === language;
            return (
              <button
                key={item.code}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handleSelect(item.code)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-400 text-slate-950 font-bold'
                    : 'text-slate-100 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-slate-950/20 text-slate-950 font-bold'
                        : 'bg-slate-800 text-cyan-300'
                    }`}
                  >
                    {item.shortCode}
                  </span>
                  <span>{item.nativeName}</span>
                </span>
                {isActive && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
