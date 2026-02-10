import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import './tailwind.css';
import App from './App'; // Fast Refresh boundary
import { BrowserRouter } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';
import { registerBuiltInAudioFeatureCalculators } from '@audio/features/audioFeatureAnalysis';
import { loadDevPlugins } from '@core/scene/plugins/dev-plugin-loader';
import { loadAllPluginsFromStorage } from '@core/scene/plugins';
if (import.meta.env.DEV) {
  void import('@devtools/registerWindowTools');
}
import { setCanonicalPPQ } from '@core/timing/ppq';

(globalThis as any).React = React;
(globalThis as any).ReactDOM = ReactDOM;
(globalThis as any).ReactJSXRuntime = ReactJsxRuntime;
(globalThis as any).ReactJSXDevRuntime = ReactJsxDevRuntime;

// Early initialization: allow overriding canonical PPQ via Vite env var VITE_CANONICAL_PPQ
try {
  const envPPQRaw = (import.meta as any).env.VITE_CANONICAL_PPQ;
  if (envPPQRaw != null && envPPQRaw !== '') {
    const parsed = Number(envPPQRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setCanonicalPPQ(parsed);
      // eslint-disable-next-line no-console
      console.info(`[timing] Canonical PPQ set from env: ${parsed}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[timing] Ignoring invalid VITE_CANONICAL_PPQ value: ${envPPQRaw}`);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[timing] Failed to initialize canonical PPQ from env', e);
}

registerBuiltInAudioFeatureCalculators();

// Load development plugins (Phase 1)
loadDevPlugins().catch((error) => {
  console.error('[App] Failed to load dev plugins:', error);
});

// Load runtime plugins from storage (Phase 3)
loadAllPluginsFromStorage().catch((error) => {
  console.error('[App] Failed to load plugins from storage:', error);
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
// Vite exposes the configured base as import.meta.env.BASE_URL (always ends with a slash)
const basename = (import.meta as any).env.BASE_URL?.replace(/\/$/, '') || '';

root.render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
