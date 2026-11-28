import React, { useState } from 'react';
import { CheckCircle2, Cloud, Loader2, LogIn, ShieldAlert } from 'lucide-react';
import {
  extractGoogleOAuthTokens,
  FIREBASE_PROJECT_ID,
  signInWithGooglePopupRaw,
} from '../firebase/firebaseApp.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  DEFAULT_EXTERNAL_SERVER_ID,
  getConfiguredApiRoutes,
  getServerIdHeaders,
  normalizeServerId,
  safeParseJsonBody,
} from '../utils/networkAndServer.ts';

interface MobileAuthBridgeProps {
  sessionId: string;
  writeSecret: string;
  serverIdParam?: string;
}

export const MobileAuthBridge: React.FC<MobileAuthBridgeProps> = ({
  sessionId,
  writeSecret,
  serverIdParam,
}) => {
  const { language, meta } = useLanguage();
  const isAr = language === 'ar';

  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleContinueGoogle = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await signInWithGooglePopupRaw();
      const { idToken, accessToken } = extractGoogleOAuthTokens(result);
      if (!idToken && !accessToken) {
        throw new Error(
          isAr
            ? 'لم يرجع Google رمز مصادقة صالحاً.'
            : 'Google did not return a valid credential token.'
        );
      }

      const sid = normalizeServerId(serverIdParam ?? '') || DEFAULT_EXTERNAL_SERVER_ID;
      const completeUrl = getConfiguredApiRoutes().mobileAuthComplete;
      const res = await fetch(completeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getServerIdHeaders(sid),
        },
        body: JSON.stringify({
          sessionId,
          writeSecret,
          idToken,
          accessToken,
        }),
      });
      const parsed = await safeParseJsonBody<{ ok?: boolean }>(res);
      if (!parsed.ok || !parsed.data?.ok) {
        throw new Error(parsed.error || 'Failed to complete mobile auth session.');
      }

      setCompleted(true);
      globalThis.setTimeout(() => {
        window.location.href = 'com.hemza.aichess://auth-complete';
      }, 450);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={meta.dir}
      className="min-h-screen bg-[#0B0E14] text-slate-100 flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full p-6 rounded-2xl border border-cyan-400/40 bg-[#0F1522]/90 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white">
              {isAr ? 'ربط حساب Google للتطبيق' : 'Connect Google Account to App'}
            </h1>
            <p className="text-xs text-slate-400 font-mono" dir="ltr">
              {FIREBASE_PROJECT_ID}
            </p>
          </div>
        </div>

        {completed ? (
          <div className="p-4 rounded-xl border border-emerald-400/50 bg-emerald-500/15 text-emerald-200 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
              <span>
                {isAr
                  ? 'تم ربط حساب Google بنجاح! يمكنك العودة الآن إلى تطبيق رَصْد الشطرنج.'
                  : 'Google account linked! You can now return to AI Chess.'}
              </span>
            </div>
            <a
              href="com.hemza.aichess://auth-complete"
              className="inline-flex items-center justify-center w-full mt-2 px-4 py-2 text-xs font-bold bg-emerald-400 text-slate-950 rounded-lg"
            >
              {isAr ? 'العودة إلى التطبيق' : 'Return to App'}
            </a>
          </div>
        ) : (
          <>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {isAr
                ? 'اضغط أدناه لتسجيل الدخول بحساب Google عبر النطاق المصرّح به، وسيتم إرسال الجلسة بأمان إلى تطبيق الهاتف فوراً.'
                : 'Tap below to sign in with Google on this authorized domain and securely pass your session back to the mobile app.'}
            </p>

            {errorMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-rose-400/50 bg-rose-950/60 text-rose-200 text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span className="break-words">{errorMsg}</span>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleContinueGoogle()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>{isAr ? 'المتابعة بحساب Google' : 'Continue with Google'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
