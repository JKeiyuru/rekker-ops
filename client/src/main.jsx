// client/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ThemeProvider } from '@/components/ThemeProvider';
import './index.css';
import { registerAppServiceWorker } from '@/lib/swRegister';
import { installAutoSync } from '@/lib/offlineQueue';
import api from '@/lib/api';

// Register the PWA service worker (no-op in Lovable preview / iframe / dev).
registerAppServiceWorker();

// Wire offline-queue auto-flush on `online` and on focus.
installAutoSync(api);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
