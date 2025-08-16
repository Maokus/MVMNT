import React from 'react';
import './App.css';
import MidiVisualizer from '@ui/layout/MidiVisualizer';
import { Routes, Route } from 'react-router-dom';
import AnimationTestPage from '@pages/AnimationTestPage';
import AboutPage from '@pages/AboutPage';

export function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<MidiVisualizer />} />
        <Route path="/animation-test" element={<AnimationTestPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  );
}

export default App;
