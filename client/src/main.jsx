// client/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ThemeProvider } from '@/components/ThemeProvider';
import './index.css';

// The app keeps install-to-home-screen metadata, but app-shell caching is being
// cleared by public/sw.js for this release. That removes stale deployed bundles
// that caused blank pages after updates. Do not register another app SW here.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs
      .filter((r) => r.active?.scriptURL?.endsWith('/sw.js') || r.installing?.scriptURL?.endsWith('/sw.js') || r.waiting?.scriptURL?.endsWith('/sw.js'))
      .forEach((r) => r.update().catch(() => {})))
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
