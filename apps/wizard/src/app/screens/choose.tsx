import { Cpu, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ChooseScreen() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/20 to-slate-950/90"></div>
      <div className="max-w-3xl w-full mx-auto px-8 animate-in fade-in duration-500 relative z-10">
        <h2 className="text-3xl font-bold text-white mb-2 text-center tracking-tight">
          What would you like to configure?
        </h2>
        <p className="text-slate-400 mb-10 text-center">
          Choose a setup path to get started.
        </p>

        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/hardware')}
            className="group relative rounded-2xl border border-slate-700/50 bg-slate-900/60 p-8 text-left transition-all hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-xl hover:shadow-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <div className="mb-6 inline-flex rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-4 shadow-lg shadow-blue-500/25">
              <Cpu className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
              Configure Hardware
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Configure network switches and firewalls via local scripts over serial or network.
            </p>
          </button>

          <button
            onClick={() => navigate('/workstation')}
            className="group relative rounded-2xl border border-slate-700/50 bg-slate-900/60 p-8 text-left transition-all hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-xl hover:shadow-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <div className="mb-6 inline-flex rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 p-4 shadow-lg shadow-violet-500/25">
              <Monitor className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-violet-400 transition-colors">
              Configure Workstation
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Set up your local workstation with the tools and configuration needed to manage VMs.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
