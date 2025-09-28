import React, { useEffect } from 'react';
// Tailwind styles are loaded via index.tsx
import MidiVisualizer from '@workspace/layout/MidiVisualizer';
import EasyModePage from '../easymode/EasyModePage';
import { Routes, Route } from 'react-router-dom';
import AnimationTestPage from '@pages/AnimationTestPage';
import AboutPage from '@pages/AboutPage';
import ChangelogPage from '@pages/ChangelogPage';
import HomePage from '@pages/HomePage';
import { TransportStatusDev } from '@workspace/dev/TransportStatusDev';

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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<MidiVisualizer />} />
        <Route path="/easymode" element={<EasyModePage />} />
        <Route path="/animation-test" element={<AnimationTestPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
      </Routes>
      <TransportStatusDev />
    </div>
  );
}

export default App;
