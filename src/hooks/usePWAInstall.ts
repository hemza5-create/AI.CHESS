import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type GlobalWithPWA = typeof globalThis & {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { userAgent?: string; standalone?: boolean };
};

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const g = globalThis as GlobalWithPWA;
    const isStandaloneDisplay =
      g.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const isIosStandalone = g.navigator?.standalone === true;
    setIsInstalled(isStandaloneDisplay || isIosStandalone);

    const userAgent = (g.navigator?.userAgent ?? '').toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    globalThis.addEventListener?.('beforeinstallprompt', handleBeforeInstallPrompt);
    globalThis.addEventListener?.('appinstalled', handleAppInstalled);

    return () => {
      globalThis.removeEventListener?.('beforeinstallprompt', handleBeforeInstallPrompt);
      globalThis.removeEventListener?.('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
