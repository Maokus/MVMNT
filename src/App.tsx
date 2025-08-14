import React from 'react';
import './App.css';
import MidiVisualizer from './components/layout/MidiVisualizer';
import { Routes, Route } from 'react-router-dom';
import { AnimationTestPage } from './components/animation-test';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<MidiVisualizer />} />
        <Route path="/animation-test" element={<AnimationTestPage />} />
      </Routes>
    </div>
  );
}

export default App;
