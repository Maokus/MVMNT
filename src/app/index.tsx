import React from 'react';
import ReactDOM from 'react-dom/client';
import './tailwind.css';
import App from './App'; // Fast Refresh boundary
import { BrowserRouter } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
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
