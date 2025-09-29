import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';

// Tailwind styles are loaded via index.tsx
const MidiVisualizer = lazy(() => import('@workspace/layout/MidiVisualizer'));
const EasyModePage = lazy(() => import('../easymode/EasyModePage'));
const AnimationTestPage = lazy(() => import('@pages/AnimationTestPage'));
const AboutPage = lazy(() => import('@pages/AboutPage'));
const ChangelogPage = lazy(() => import('@pages/ChangelogPage'));
const HomePage = lazy(() => import('@pages/HomePage'));

const TransportStatusDevLazy = import.meta.env.DEV
  ? lazy(() =>
      import('@workspace/dev/TransportStatusDev').then((module) => ({
        default: module.TransportStatusDev,
      })),
    )
  : null;

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
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-neutral-400">Loading…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<MidiVisualizer />} />
          <Route path="/easymode" element={<EasyModePage />} />
          <Route path="/animation-test" element={<AnimationTestPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
        </Routes>
      </Suspense>
      {TransportStatusDevLazy ? (
        <Suspense fallback={null}>
          <TransportStatusDevLazy />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
