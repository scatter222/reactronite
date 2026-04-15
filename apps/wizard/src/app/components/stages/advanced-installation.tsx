import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Terminal as TerminalIcon, CheckCircle2, XCircle, Loader2, ChevronRight, MessageSquare } from 'lucide-react';
import { InstallerPrompt } from '@/app/components/installer-prompt';
import { InstallerDisplay } from '@/app/components/installer-display';
import type { InstallStep, InstallCommand, UserConfig } from '@/app/types/installer-config';

interface AdvancedInstallationStageProps {
  config: UserConfig;
  initialCapturedVariables?: Record<string, any>;
  onNext: () => void;
  onBack: () => void;
  onCapturedVariables?: (vars: Record<string, any>) => void;
}

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'success' | 'info' | 'step' | 'variable';
  content: string;
  timestamp: Date;
}

export function AdvancedInstallationStage({ config, initialCapturedVariables, onNext, onBack, onCapturedVariables }: AdvancedInstallationStageProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [runtimeVariables, setRuntimeVariables] = useState<Record<string, any>>(initialCapturedVariables || {});
  const [currentPrompt, setCurrentPrompt] = useState<InstallCommand | null>(null);
  const [currentDisplay, setCurrentDisplay] = useState<InstallCommand | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false); // Use ref to avoid closure issues
  const runtimeVariablesRef = useRef<Record<string, any>>(initialCapturedVariables || {});
  const terminalRef = useRef<HTMLDivElement>(null);

  // Helper to update runtime variables in both state and ref, and report to parent
  const updateRuntimeVariables = (updater: (prev: Record<string, any>) => Record<string, any>) => {
    setRuntimeVariables(prev => {
      const next = updater(prev);
      runtimeVariablesRef.current = next;
      onCapturedVariables?.(next);
      return next;
    });
  };

  // Combine user config with runtime variables
  const allVariables = { ...config, ...runtimeVariables };

  useEffect(() => {
    loadInstallSteps();
    setupEventListeners();
    
    return () => {
      electron.ipcRenderer.removeAllListeners('installer:commandOutput');
      electron.ipcRenderer.removeAllListeners('installer:stepStart');
      electron.ipcRenderer.removeAllListeners('installer:stepComplete');
      electron.ipcRenderer.removeAllListeners('installer:stepError');
    };
  }, []);

  const loadInstallSteps = async () => {
    try {
      const installerConfig = await electron.ipcRenderer.invoke('installer:getConfig');
      // Use advanced config if available
      const advancedConfig = await electron.ipcRenderer.invoke('installer:getAdvancedConfig');
      const activeConfig = advancedConfig || installerConfig;

      setSteps(activeConfig.installSteps || []);
    } catch (error) {
      console.error('Failed to load install steps:', error);
      addLine('error', `Failed to load installation steps: ${error.message}`);
    }
  };

  const setupEventListeners = () => {
    electron.ipcRenderer.on('installer:commandOutput', (_, data) => {
      if (data.type === 'stdout') {
        addLine('output', data.data.trim());
      } else if (data.type === 'stderr') {
        addLine('error', data.data.trim());
      }
    });

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
    
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 50);
  };

  const evaluateCondition = (condition: string): boolean => {
    try {
      const currentVars = { ...config, ...runtimeVariablesRef.current };
      const func = new Function(...Object.keys(currentVars), `return ${condition}`);
      return func(...Object.values(currentVars));
    } catch (error) {
      console.error('Error evaluating condition:', condition, error);
      return false;
    }
  };

  const waitForPromptResponse = (): Promise<void> => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // Use ref to avoid closure issues - ref always has current value
        if (!isPausedRef.current) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  };

  const processCommand = async (command: InstallCommand): Promise<void> => {
    // Check condition
    if (command.condition && !evaluateCondition(command.condition)) {
      addLine('info', `⊘ Skipping: ${command.description} (condition not met)`);
      return;
    }

    // Handle different command types
    if (command.type === 'prompt') {
      // Show interactive prompt
      addLine('info', `⌨ User input required: ${command.description}`);
      setCurrentPrompt(command);
      setIsPaused(true);
      isPausedRef.current = true; // Update ref immediately for reliable checking

      // Wait for user input - don't continue until prompt is handled
      await waitForPromptResponse();

      // Add a small delay to ensure state updates have propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    if (command.type === 'display') {
      // Show display card
      setCurrentDisplay(command);
      addLine('info', `📊 Displaying: ${command.title || 'Information'}`);
      
      // Auto-continue after a delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      setCurrentDisplay(null);
      return;
    }

    // Default command execution
    if (!command.type || command.type === 'command') {
      if (!command.cmd) {
        addLine('error', `✗ No command specified for: ${command.description}`);
        return;
      }
      
      addLine('command', `$ ${command.description}`);

      const currentVars = { ...config, ...runtimeVariablesRef.current };
      const result = await electron.ipcRenderer.invoke('installer:runCommand', command, currentVars);
      
      if (result.output) {
        const outputLines = result.output.trim().split('\n');
        outputLines.forEach((line: string) => {
          if (line.trim()) {
            addLine('output', line);
          }
        });
        
        // Capture output as variable if specified
        if (command.captureAs && result.success) {
          const capturedValue = result.output.trim();
          updateRuntimeVariables(prev => ({
            ...prev,
            [command.captureAs]: capturedValue || command.defaultValue || ''
          }));
          addLine('variable', `📝 Captured ${command.captureAs}: ${capturedValue}`);
        }
      }
      
      if (!result.success) {
        // Use default value if capture failed
        if (command.captureAs && command.defaultValue) {
          updateRuntimeVariables(prev => ({
            ...prev,
            [command.captureAs]: command.defaultValue
          }));
          addLine('info', `⚠ Using default value for ${command.captureAs}: ${command.defaultValue}`);
        } else {
          addLine('error', `✗ Command failed: ${result.error || 'Unknown error'}`);
          if (!command.safe) {
            setHasError(true);
            throw new Error(result.error);
          }
        }
      } else {
        addLine('success', `✓ ${command.description} completed`);
      }
    }
  };

  const handlePromptSubmit = (value: any) => {
    if (currentPrompt?.captureAs) {
      updateRuntimeVariables(prev => ({
        ...prev,
        [currentPrompt.captureAs!]: value
      }));
      addLine('variable', `📝 Captured ${currentPrompt.captureAs}: ${
        currentPrompt.promptType === 'password' ? '********' :
        Array.isArray(value) ? value.join(', ') : value
      }`);
    }

    // Clear prompt first, then unpause to ensure proper sequencing
    setCurrentPrompt(null);
    // Update both state and ref to ensure proper synchronization
    setIsPaused(false);
    isPausedRef.current = false; // This is what the wait function actually checks
  };

  const runInstallation = async () => {
    setIsInstalling(true);
    setHasError(false);
    setLines([]);
    
    addLine('info', '🚀 Starting advanced installation process...');
    addLine('info', '═══════════════════════════════════════');
    
    // Save initial config
    await electron.ipcRenderer.invoke('installer:saveUserConfig', config);
    
    try {
      for (const step of steps) {
        addLine('step', `\n📦 ${step.name}`);
        addLine('info', step.description);

        for (const command of step.commands) {
          // Process the command (this will handle prompts internally)
          await processCommand(command);

          // Double-check: ensure we're not paused before continuing
          // This handles any edge cases where isPaused might still be true
          while (isPausedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Add small delay between commands for visibility
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        addLine('success', `✓ ${step.name} completed successfully\n`);
      }
      
      addLine('success', '');
      addLine('success', '═══════════════════════════════════════');
      addLine('success', '✨ Installation completed successfully! ✨');
      addLine('success', '═══════════════════════════════════════');
      
      // Display final variables
      addLine('info', '\n📊 Final Configuration:');
      Object.entries(runtimeVariablesRef.current).forEach(([key, value]) => {
        if (!key.includes('Password') && !key.includes('passphrase')) {
          addLine('variable', `  ${key}: ${value}`);
        }
      });
      
      setInstallComplete(true);
    } catch (error) {
      addLine('error', `Installation failed: ${error.message}`);
      setHasError(true);
    } finally {
      setIsInstalling(false);
    }
  };

  useEffect(() => {
    if (steps.length > 0 && !isInstalling && !installComplete) {
      // Start installation automatically only once when steps are loaded
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
      case 'variable':
        return 'text-cyan-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Advanced Installation</h2>
        <p className="text-slate-400">
          {currentStep || 'Preparing installation...'}
        </p>
      </div>

      {/* Interactive Prompt Overlay */}
      {currentPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="max-w-2xl w-full">
            <InstallerPrompt
              prompt={currentPrompt}
              variables={allVariables}
              onSubmit={handlePromptSubmit}
            />
          </div>
        </div>
      )}

      {/* Display Card */}
      {currentDisplay && (
        <div className="mb-6">
          <InstallerDisplay
            title={currentDisplay.title}
            content={currentDisplay.content || []}
            variables={allVariables}
          />
        </div>
      )}

      <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm overflow-hidden rounded-xl shadow-2xl">
        <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
          <TerminalIcon className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">Installation Terminal</span>
          {isPaused && (
            <div className="ml-auto flex items-center gap-2 text-yellow-400">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Waiting for input...</span>
            </div>
          )}
          {isInstalling && !isPaused && (
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
        >
          {lines.map((line) => (
            <div 
              key={line.id}
              className={`py-0.5 ${getLineColor(line.type)} animate-in fade-in slide-in-from-left-2 duration-200`}
            >
              {line.type === 'command' && <ChevronRight className="w-3 h-3 inline mr-1" />}
              {line.content}
            </div>
          ))}
          {isInstalling && !isPaused && lines.length > 0 && (
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
          disabled={!installComplete || isInstalling || hasError}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
        >
          {isInstalling ? 'Installing...' : 'Continue to Completion'}
        </Button>
      </div>
    </div>
  );
}