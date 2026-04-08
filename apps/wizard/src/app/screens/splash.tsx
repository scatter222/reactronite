import { Button } from '@/app/components/ui/button';
import { Server, Monitor, Network, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SplashScreen() {
  const navigate = useNavigate();

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

        <p className="text-lg text-slate-400 mb-8 leading-relaxed">
          Configure this host as a KVM virtualisation environment.
          We'll set up networking, storage, and base images so you can start deploying VMs.
        </p>

        <div className="flex gap-6 justify-center mb-10 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-400" />
            Bridge Networks
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            Storage Pools
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            Base Images
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Button
            size="lg"
            onClick={() => navigate('/installer')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg font-medium shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30"
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate('/vms')}
            className="px-8 py-6 text-lg font-medium"
          >
            <Server className="w-5 h-5 mr-2" />
            Manage VMs
          </Button>
        </div>
      </div>
    </div>
  );
}