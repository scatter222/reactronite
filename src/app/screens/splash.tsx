import { Button } from '@/app/components/ui/button';
import { Package2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SplashScreen() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/installer');
  };

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/20 to-slate-950/90"></div>
      <div className="text-center max-w-2xl mx-auto px-8 animate-in fade-in duration-500 relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/25">
            <Package2 className="w-12 h-12 text-white" />
          </div>
        </div>
        
        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
          Installation Wizard
        </h1>
        
        <p className="text-lg text-slate-400 mb-12 leading-relaxed">
          Get your application up and running in just a few simple steps. 
          We'll guide you through the entire process.
        </p>
        
        <Button
          size="lg"
          onClick={handleGetStarted}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg font-medium shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}