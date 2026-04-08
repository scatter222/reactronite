import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Terminal as TerminalIcon, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { InstallConfig } from '@/app/screens/installer';

interface InstallationStageProps {
  config: InstallConfig;
  onNext: () => void;
  onBack: () => void;
}

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'success' | 'info';
  content: string;
  timestamp: Date;
}

export function InstallationStage({ config, onNext, onBack }: InstallationStageProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const addLine = (type: TerminalLine['type'], content: string) => {
    const newLine: TerminalLine = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      content,
      timestamp: new Date()
    };
    setLines(prev => [...prev, newLine]);
    
    // Auto-scroll to bottom
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 50);
  };

  const simulateInstallation = async () => {
    setIsInstalling(true);
    setHasError(false);
    
    // Simulate installation steps
    addLine('info', '🚀 Starting installation process...');
    await delay(500);
    
    addLine('command', `$ mkdir -p ${config.installPath}`);
    await delay(800);
    addLine('output', `Creating directory: ${config.installPath}`);
    await delay(600);
    
    addLine('command', `$ cd ${config.installPath}`);
    await delay(500);
    
    addLine('info', '📦 Downloading required packages...');
    await delay(1000);
    
    const packages = ['core-modules', 'dependencies', 'dev-tools', 'configurations'];
    for (const pkg of packages) {
      addLine('command', `$ npm install ${pkg}`);
      await delay(600);
      addLine('success', `✓ Package '${pkg}' installed successfully`);
      await delay(400);
    }
    
    addLine('info', '🔧 Configuring project settings...');
    await delay(800);
    
    addLine('command', `$ echo "PROJECT_NAME=${config.projectName}" > .env`);
    await delay(500);
    
    if (config.enableLogging) {
      addLine('command', '$ mkdir -p logs');
      await delay(400);
      addLine('output', 'Log directory created');
      await delay(300);
    }
    
    if (config.customOptions.apiEndpoint) {
      addLine('command', `$ echo "API_ENDPOINT=${config.customOptions.apiEndpoint}" >> .env`);
      await delay(500);
    }
    
    addLine('info', '🔨 Building project...');
    await delay(1000);
    
    addLine('command', '$ npm run build');
    await delay(1500);
    
    // Simulate build output
    const buildSteps = [
      'Compiling TypeScript...',
      'Bundling assets...',
      'Optimizing production build...',
      'Generating source maps...'
    ];
    
    for (const step of buildSteps) {
      addLine('output', step);
      await delay(600);
    }
    
    addLine('success', '✓ Build completed successfully');
    await delay(500);
    
    addLine('info', '🎯 Running post-installation scripts...');
    await delay(800);
    
    addLine('command', '$ npm run postinstall');
    await delay(1000);
    
    addLine('success', '');
    addLine('success', '════════════════════════════════════════');
    addLine('success', '✨ Installation completed successfully! ✨');
    addLine('success', '════════════════════════════════════════');
    addLine('info', `Project "${config.projectName}" is ready at ${config.installPath}`);
    
    setInstallComplete(true);
    setIsInstalling(false);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  useEffect(() => {
    // Start installation automatically when component mounts
    simulateInstallation();
  }, []);

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'command':
        return 'text-blue-400';
      case 'output':
        return 'text-slate-300';
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'info':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatContent = (line: TerminalLine) => {
    if (line.type === 'command') {
      return <span className="font-mono">{line.content}</span>;
    }
    return <span>{line.content}</span>;
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Installation</h2>
        <p className="text-slate-400">Installing your application with the configured settings</p>
      </div>

      <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm overflow-hidden rounded-xl shadow-2xl">
        <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
          <TerminalIcon className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">Installation Terminal</span>
          {isInstalling && (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-auto" />
          )}
          {installComplete && !hasError && (
            <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
          )}
          {hasError && (
            <XCircle className="w-4 h-4 text-red-400 ml-auto" />
          )}
        </div>
        
        <div 
          ref={terminalRef}
          className="p-4 h-[500px] overflow-y-auto font-mono text-sm bg-slate-950/50"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(30, 41, 59, 0.1) 20px, rgba(30, 41, 59, 0.1) 21px)'
          }}
        >
          {lines.map((line) => (
            <div 
              key={line.id}
              className={`py-0.5 ${getLineColor(line.type)} animate-in fade-in slide-in-from-left-2 duration-200`}
            >
              {formatContent(line)}
            </div>
          ))}
          {isInstalling && (
            <div className="flex items-center gap-2 text-blue-400 mt-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="animate-pulse">Processing...</span>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between mt-8">
        <Button
          onClick={onBack}
          variant="outline"
          size="lg"
          disabled={isInstalling}
          className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg"
        >
          Back
        </Button>
        
        <Button
          onClick={onNext}
          size="lg"
          disabled={!installComplete || isInstalling}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
        >
          {isInstalling ? 'Installing...' : 'Continue to Completion'}
        </Button>
      </div>
    </div>
  );
}