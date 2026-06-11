// client/src/components/ManufacturingErrorBoundary.jsx
// Class-based error boundary wrapping the manufacturing module.
// Catches "r is not a function" and similar bundle-init errors that can occur
// when jsPDF / jspdf-autotable initialise before React's chunk is ready.
// Shows a friendly retry UI instead of a blank screen.

import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ManufacturingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log for debugging; remove in production if desired
    console.error('[ManufacturingErrorBoundary]', error, info);
  }

  handleRetry = () => {
    // A simple page reload is the most reliable recovery from a bundle-init race
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Manufacturing module failed to load
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            A module initialisation error occurred. This usually resolves itself on reload.
          </p>
          {this.state.error && (
            <p className="text-xs font-mono text-muted-foreground/60 mt-1">
              {this.state.error.message}
            </p>
          )}
        </div>
        <button
          onClick={this.handleRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reload page
        </button>
      </div>
    );
  }
}
