import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import './tailwind.css';
import '@fontsource/inter/100.css';
import '@fontsource/inter/200.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/inter/100-italic.css';
import '@fontsource/inter/200-italic.css';
import '@fontsource/inter/300-italic.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/500-italic.css';
import '@fontsource/inter/600-italic.css';
import '@fontsource/inter/700-italic.css';
import '@fontsource/inter/800-italic.css';
import '@fontsource/inter/900-italic.css';
import App from './App'; // Fast Refresh boundary
import { BrowserRouter } from 'react-router-dom';
import { registerBuiltInAudioFeatureCalculators } from '@audio/features/audioFeatureAnalysis';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';
if (import.meta.env.DEV) {
    void import('@devtools/registerWindowTools');
}
import { setCanonicalPPQ } from '@core/timing/ppq';

(globalThis as any).React = React;
(globalThis as any).ReactDOM = ReactDOM;
(globalThis as any).ReactJSXRuntime = ReactJsxRuntime;
(globalThis as any).ReactJSXDevRuntime = ReactJsxDevRuntime;

const mvmntGlobal = ((globalThis as any).MVMNT ??= {});
mvmntGlobal.state = {
    ...(mvmntGlobal.state ?? {}),
    timelineStore: useTimelineStore,
};
mvmntGlobal.selectors = {
    ...(mvmntGlobal.selectors ?? {}),
    selectNotesInWindow,
};

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

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
