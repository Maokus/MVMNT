import React from 'react';
// Tailwind styles are loaded via index.tsx
import MidiVisualizer from '@ui/layout/MidiVisualizer';
import { Routes, Route } from 'react-router-dom';
import AnimationTestPage from '@pages/AnimationTestPage';
import AboutPage from '@pages/AboutPage';
import ChangelogPage from '@pages/ChangelogPage';

export function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<MidiVisualizer />} />
        <Route path="/animation-test" element={<AnimationTestPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
      </Routes>
    </div>
  );
}

export default App;
