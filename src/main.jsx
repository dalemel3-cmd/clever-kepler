import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import AuthGate from './auth/AuthGate.jsx'
import { installGlobalErrorReporting, reportError } from './errorReporting.js'

installGlobalErrorReporting()

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
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
})

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    reportError(error?.message || String(error), {
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
        <div style={{ color: 'red', background: 'white', padding: '20px', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
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
