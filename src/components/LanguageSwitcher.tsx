import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/translations.ts';

interface MenuPosition {
  top: number;
  left: number;
}

export const LanguageSwitcher: React.FC = () => {
  const { language, meta, t, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 192;
    const menuHeight = menuRef.current?.offsetHeight ?? 230;
    const margin = 8;

    const preferredLeft =
      meta.dir === 'rtl' ? rect.left : rect.right - menuWidth;
    const left = Math.max(
      margin,
      Math.min(window.innerWidth - menuWidth - margin, preferredLeft)
    );

    const fitsBelow = rect.bottom + margin + menuHeight <= window.innerHeight - margin;
    const top = fitsBelow
      ? rect.bottom + margin
      : Math.max(margin, rect.top - menuHeight - margin);

    setMenuPos({ top, left });
  }, [meta.dir]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePosition]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.switchLanguageAria}
        title={t.switchLanguageAria}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-bold text-cyan-200 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300 shrink-0" />
        <span>{meta.nativeName}</span>
        <ChevronDown
          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-200 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            dir={meta.dir}
            aria-label={t.languageLabel}
            style={{
              position: 'fixed',
              top: menuPos ? `${menuPos.top}px` : '-9999px',
              left: menuPos ? `${menuPos.left}px` : '-9999px',
              visibility: menuPos ? 'visible' : 'hidden',
            }}
            className="z-[9999] min-w-[192px] rounded-xl border border-slate-500/75 bg-[#0F1522]/95 backdrop-blur-md p-1.5 shadow-2xl"
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
          </div>,
          document.body
        )}
    </div>
  );
};
