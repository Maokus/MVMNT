import React from 'react';
import ReactDOM from 'react-dom/client';
import './tailwind.css';
import App from './App'; // Fast Refresh boundary
import { BrowserRouter } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';
if (import.meta.env.DEV) {
  void import('@devtools/registerWindowTools');
}
import { setCanonicalPPQ } from '@core/timing/ppq';

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
