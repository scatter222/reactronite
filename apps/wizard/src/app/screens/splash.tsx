import { Button } from '@/app/components/ui/button';
import { Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SplashScreen() {
  const navigate = useNavigate();

  const nextRoute = __BUILD_MODE__ === 'server' ? '/installer' : '/choose';

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/20 to-slate-950/90"></div>
      <div className="text-center max-w-2xl mx-auto px-8 animate-in fade-in duration-500 relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/25">
            <Server className="w-12 h-12 text-white" />
          </div>
        </div>

        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
          KVM Environment Setup
        </h1>

        <p className="text-lg text-slate-400 mb-10 leading-relaxed">
          Configure this host as a KVM virtualisation environment.
          We'll set up networking, storage, and base images so you can start deploying VMs.
        </p>

        <Button
          size="lg"
          onClick={() => navigate(nextRoute)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg font-medium shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
