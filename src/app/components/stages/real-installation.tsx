import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Terminal as TerminalIcon, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react';
import type { InstallStep, UserConfig } from '@/app/types/installer-config';

interface RealInstallationStageProps {
  config: UserConfig;
  onNext: () => void;
  onBack: () => void;
}

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'success' | 'info' | 'step';
  content: string;
  timestamp: Date;
}

export function RealInstallationStage({ config, onNext, onBack }: RealInstallationStageProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInstallSteps();
    setupEventListeners();
    
    return () => {
      // Cleanup event listeners
      electron.ipcRenderer.removeAllListeners('installer:commandOutput');
      electron.ipcRenderer.removeAllListeners('installer:stepStart');
      electron.ipcRenderer.removeAllListeners('installer:stepComplete');
      electron.ipcRenderer.removeAllListeners('installer:stepError');
    };
  }, []);

  const loadInstallSteps = async () => {
    try {
      const installSteps = await electron.ipcRenderer.invoke('installer:getInstallSteps');
      setSteps(installSteps);
    } catch (error) {
      console.error('Failed to load install steps:', error);
      addLine('error', `Failed to load installation steps: ${error.message}`);
    }
  };

  const setupEventListeners = () => {
    // Listen for real-time command output
    electron.ipcRenderer.on('installer:commandOutput', (_, data) => {
      if (data.type === 'stdout') {
        addLine('output', data.data.trim());
      } else if (data.type === 'stderr') {
        addLine('error', data.data.trim());
      }
    });

    // Listen for step events
    electron.ipcRenderer.on('installer:stepStart', (_, data) => {
      setCurrentStep(data.name);
      addLine('step', `📦 ${data.name}: ${data.description}`);
    });

    electron.ipcRenderer.on('installer:stepComplete', (_, data) => {
      addLine('success', `✓ ${data.name} completed successfully`);
    });

    electron.ipcRenderer.on('installer:stepError', (_, data) => {
      addLine('error', `✗ Error in ${data.step}: ${data.error}`);
      setHasError(true);
    });
  };

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

  const runInstallation = async () => {
    setIsInstalling(true);
    setHasError(false);
    setLines([]);
    
    addLine('info', '🚀 Starting installation process...');
    addLine('info', '═══════════════════════════════════════');
    
    // Save user configuration
    await electron.ipcRenderer.invoke('installer:saveUserConfig', config);
    
    try {
      // Run each step
      for (const step of steps) {
        addLine('step', `\n📦 ${step.name}`);
        addLine('info', step.description);
        
        for (const command of step.commands) {
          addLine('command', `$ ${command.description}`);
          
          const result = await electron.ipcRenderer.invoke('installer:runCommand', command, config);
          
          if (result.output) {
            const outputLines = result.output.trim().split('\n');
            outputLines.forEach(line => {
              if (line.trim()) {
                addLine('output', line);
              }
            });
          }
          
          if (!result.success) {
            addLine('error', `✗ Command failed: ${result.error || 'Unknown error'}`);
            if (!command.safe) {
              setHasError(true);
              setIsInstalling(false);
              return;
            }
          } else {
            addLine('success', `✓ ${command.description} completed`);
          }
          
          // Add small delay between commands for readability
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        addLine('success', `✓ ${step.name} completed successfully\n`);
      }
      
      // Run post-install commands
      const installerConfig = await electron.ipcRenderer.invoke('installer:getConfig');
      if (installerConfig.postInstall) {
        addLine('step', '\n📋 Running post-installation tasks...');
        
        for (const postCmd of installerConfig.postInstall) {
          const result = await electron.ipcRenderer.invoke('installer:runCommand', 
            { cmd: postCmd.command, description: postCmd.name, safe: postCmd.safe },
            config
          );
          
          if (result.output) {
            addLine('output', result.output.trim());
          }
        }
      }
      
      addLine('success', '');
      addLine('success', '═══════════════════════════════════════');
      addLine('success', '✨ Installation completed successfully! ✨');
      addLine('success', '═══════════════════════════════════════');
      
      setInstallComplete(true);
    } catch (error) {
      addLine('error', `Installation failed: ${error.message}`);
      setHasError(true);
    } finally {
      setIsInstalling(false);
    }
  };

  useEffect(() => {
    // Start installation automatically when component mounts
    if (steps.length > 0) {
      runInstallation();
    }
  }, [steps]);

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
      case 'step':
        return 'text-purple-400 font-bold';
      default:
        return 'text-slate-400';
    }
  };

  const formatContent = (line: TerminalLine) => {
    if (line.type === 'command') {
      return <span className="font-mono">{line.content}</span>;
    }
    if (line.type === 'step') {
      return <span className="text-lg">{line.content}</span>;
    }
    return <span>{line.content}</span>;
  };

  const retry = () => {
    setLines([]);
    setHasError(false);
    setInstallComplete(false);
    runInstallation();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Installation</h2>
        <p className="text-slate-400">
          {currentStep || 'Preparing installation...'}
        </p>
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
              {line.type === 'command' && (
                <ChevronRight className="w-3 h-3 inline mr-1" />
              )}
              {formatContent(line)}
            </div>
          ))}
          {isInstalling && lines.length > 0 && (
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
        
        {hasError && !isInstalling && (
          <Button
            onClick={retry}
            size="lg"
            className="bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg shadow-yellow-600/25 rounded-lg"
          >
            Retry Installation
          </Button>
        )}
        
        <Button
          onClick={onNext}
          size="lg"
          disabled={!installComplete || isInstalling || hasError}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
        >
          {isInstalling ? 'Installing...' : 'Continue to Completion'}
        </Button>
      </div>
    </div>
  );
}