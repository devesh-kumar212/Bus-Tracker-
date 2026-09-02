import React from 'react';
import { ShieldAlert, RefreshCw, Bus } from 'lucide-react';

export default class PassengerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Passenger Error Boundary caught an exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-zinc-900/90 border border-rose-900/60 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
            
            <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400 shadow-xl shadow-rose-950/50 animate-bounce">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white tracking-tight mb-2">
                Something went wrong in Passenger Module
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {this.state.error?.message || 'An unexpected rendering error occurred. You can retry or return to the main dashboard.'}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-left font-mono text-[10px] text-rose-300 max-h-32 overflow-y-auto custom-scrollbar">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold rounded-xl text-xs tracking-wide transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Passenger Module</span>
              </button>

              <a
                href="/"
                className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs tracking-wide transition-all border border-zinc-700 cursor-pointer flex items-center gap-1.5"
              >
                <Bus className="w-4 h-4" />
                <span>Home</span>
              </a>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
