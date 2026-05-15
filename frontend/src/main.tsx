import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

// Catch promise rejections that escape React's error boundary so they
// land in something we can ship to telemetry later.
window.addEventListener('unhandledrejection', (event) => {
  // TODO: forward to Sentry/Datadog RUM once configured.
  // eslint-disable-next-line no-console
  console.error('[unhandledrejection]', event.reason);
});

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
