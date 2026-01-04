import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';

// Tailwind styles are loaded via index.tsx
const MidiVisualizer = lazy(() => import('@workspace/layout/MidiVisualizer'));
const EasyModePage = lazy(() => import('../easymode/EasyModePage'));
const AnimationTestPage = lazy(() => import('@pages/AnimationTestPage'));
const AboutPage = lazy(() => import('@pages/AboutPage'));
const ChangelogPage = lazy(() => import('@pages/ChangelogPage'));
const HomePage = lazy(() => import('@pages/HomePage'));

const DeveloperOverlayLazy = lazy(() =>
  import('@workspace/dev/DeveloperOverlay').then((module) => ({
    default: module.DeveloperOverlay,
  })),
);

const AppLoadingScreen: React.FC<{ message?: string }> = ({ message = 'Loading MVMNT…' }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-16 rounded-[44px] bg-gradient-to-br from-indigo-500/25 via-fuchsia-500/20 to-sky-500/25 opacity-70 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex w-[min(90vw,22rem)] flex-col items-center gap-5 overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-900/85 px-8 py-9 text-center shadow-[0_35px_120px_-40px_rgba(79,70,229,0.55)] backdrop-blur">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute h-12 w-12 animate-ping rounded-full bg-indigo-400/25" aria-hidden="true" />
            <span className="relative h-12 w-12 animate-spin rounded-full border-[3px] border-indigo-300/60 border-t-transparent" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold tracking-tight text-neutral-100">{message}</p>
            <p className="text-sm text-neutral-400">Booting up MVMNT…</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export function App() {

  useEffect(() => {
    const preventPinchZoom = (e: any) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    const preventGesture = (e: any) => {
      e.preventDefault();
    };

    // For most browsers
    window.addEventListener('touchmove', preventPinchZoom, { passive: false });

    // For Safari (iOS)
    window.addEventListener('gesturestart', preventGesture);
    window.addEventListener('gesturechange', preventGesture);
    window.addEventListener('gestureend', preventGesture);

    return () => {
      window.removeEventListener('touchmove', preventPinchZoom);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
      window.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  return (
    <div className="App">
      <Suspense fallback={<AppLoadingScreen />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<MidiVisualizer />} />
          <Route path="/easymode" element={<EasyModePage />} />
          <Route path="/animation-test" element={<AnimationTestPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
        </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <DeveloperOverlayLazy />
      </Suspense>
    </div>
  );
}

export default App;
