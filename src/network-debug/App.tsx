import React from 'react';
import Playground from './components/Playground';

interface NetworkDebugAppProps {
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
}

export default function App({ apiKey, onApiKeyChange }: NetworkDebugAppProps = {}) {
  return (
    <div className="min-h-full bg-[#07070a] text-zinc-100 flex flex-col font-sans selection:bg-violet-500/30 selection:text-violet-200">
      {/* Background radial soft light blobs for futuristic visual depth */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[15%] right-[10%] w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[160px]"></div>
      </div>

      <header className="border-b border-zinc-900/60 bg-zinc-950/45 py-4 relative z-10 sticky top-0 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-violet-600 rounded-lg flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(124,58,237,0.4)]">
              Z
            </div>
            <div className="font-medium text-lg tracking-wide text-zinc-100">
              Zhenzhen API Sandbox
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full relative z-10 space-y-8">
        <Playground apiKey={apiKey} onApiKeyChange={onApiKeyChange} />
      </main>

      {/* Symmetrical footer */}
      <footer className="border-t border-zinc-900/60 bg-zinc-950/45 py-6 mt-16 text-center text-xs font-mono text-zinc-600 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <div>Zhenzhen API Integration Testing Environment</div>
          <div className="text-[10px] text-zinc-800">
            For testing and validating gpt-image-2 endpoint requirements.
          </div>
        </div>
      </footer>
    </div>
  );
}
