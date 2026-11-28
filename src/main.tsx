import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { FirebaseErrorBoundary, FirebaseProvider } from './firebase/FirebaseContext.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <FirebaseErrorBoundary>
    <FirebaseProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </FirebaseProvider>
  </FirebaseErrorBoundary>
);
