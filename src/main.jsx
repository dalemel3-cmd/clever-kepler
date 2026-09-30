import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import AuthGate from './auth/AuthGate.jsx'
import { installGlobalErrorReporting, reportError, handleIfStaleChunk } from './errorReporting.js'

installGlobalErrorReporting()

// Report anything the index.html startup safety net caught on a previous launch that
// never got far enough to mount (see the inline script there).
try {
  const boot = JSON.parse(localStorage.getItem('hpd_boot_errors') || '[]');
  if (boot.length) {
    localStorage.removeItem('hpd_boot_errors');
    reportError(`Startup failed on a previous launch: ${boot.join(' | ')}`, { source: 'boot' });
  }
} catch { /* storage unavailable */ }

// Without this, vite-plugin-pwa falls back to a bare
// `navigator.serviceWorker.register(...)` with no update-detection logic -
// registerType: 'autoUpdate' in vite.config.js only controls what the
// generated service worker does once it's told to activate, it doesn't by
// itself make the page notice a new one exists. That's why a hard refresh
// (which bypasses the service worker and its stale cache entirely) showed a
// new deploy while an ordinary refresh kept serving whatever the still-active
// old worker had already cached. registerSW() here wires up the real
// check-for-update-and-reload behavior: on finding a new service worker it
// activates it immediately and reloads the page once it takes control.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Service workers are cached for up to 24h by default and only
    // re-checked automatically on navigation - polling here means a coach
    // who leaves the app open in a kiosk/tab for hours still picks up a
    // new deploy without needing to close and reopen it.
    // update() rejects when the device can't reach the server (flaky gym Wi-Fi) -
    // harmless, the next hourly check retries, so don't let it surface as an
    // unhandled rejection in app_errors.
    setInterval(() => { registration.update().catch(() => {}); }, 60 * 60 * 1000);
  },
})

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    const message = error?.message || String(error);

    // A deploy replaces every lazy-loaded screen chunk with a new content-hashed
    // filename - a tab that loaded its shell before (or across) a deploy fails to
    // fetch a screen it hasn't opened yet with exactly this error. Recognized and
    // auto-recovered here (see errorReporting.js) instead of leaving the coach
    // stuck on this permanent error screen with no way out but a manual hard
    // refresh.
    // Recovered by that reload, so not reported (see errorReporting.js); anything
    // else - including a stale chunk the reload didn't fix - is.
    if (handleIfStaleChunk(message)) return;
    reportError(message, {
      stack: error?.stack || errorInfo?.componentStack,
      source: 'react-boundary',
    });

    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#030e20', color: '#e8ecf2', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ maxWidth: '440px', width: '100%', background: '#0a1628', border: '1px solid #1f3252', borderRadius: '16px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h1 style={{ margin: 0, fontFamily: 'Oswald, Impact, sans-serif', fontSize: '24px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Something went wrong</h1>
            <p style={{ margin: 0, color: '#93a0b4', lineHeight: 1.5 }}>
              This screen hit an error and couldn't load. Your saved data is safe. Reloading usually fixes it, and the error has been logged.
            </p>
            <button onClick={() => window.location.reload()} style={{ height: '44px', borderRadius: '10px', border: 0, background: '#b89c5b', color: '#030a14', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
              Reload
            </button>
            <details style={{ color: '#93a0b4', fontSize: '12px' }}>
              <summary style={{ cursor: 'pointer' }}>Technical details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '8px 0 0' }}>
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
// Tells the index.html safety net the app started, so it never shows its fallback.
window.__hpdMounted = true
