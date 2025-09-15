import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { PreCheck } from '@/app/types/installer-config';

interface PreChecksStageProps {
  onNext: () => void;
  onBack: () => void;
}

interface CheckResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  message?: string;
  output?: string;
}

export function PreChecksStage({ onNext, onBack }: PreChecksStageProps) {
  const [checks, setChecks] = useState<PreCheck[]>([]);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [allChecksPassed, setAllChecksPassed] = useState(false);

  useEffect(() => {
    loadPreChecks();
  }, []);

  const loadPreChecks = async () => {
    try {
      const config = await electron.ipcRenderer.invoke('installer:getConfig');
      setChecks(config.preChecks);
      setCheckResults(config.preChecks.map((check: PreCheck) => ({
        name: check.name,
        status: 'pending',
      })));
    } catch (error) {
      console.error('Failed to load pre-checks:', error);
    }
  };

  const runPreChecks = async () => {
    setIsRunning(true);
    setAllChecksPassed(false);
    
    const results: CheckResult[] = [];
    
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      
      // Update status to running
      setCheckResults(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'running' };
        return updated;
      });
      
      try {
        // Execute the check
        const result = await electron.ipcRenderer.invoke('installer:runPreCheck', check);
        
        // Determine status based on result
        let status: CheckResult['status'] = 'success';
        let message = 'Check passed';
        
        if (!result.success) {
          status = 'error';
          message = check.errorMessage || 'Check failed';
        } else if (result.warning) {
          status = 'warning';
          message = result.warning;
        }
        
        const checkResult: CheckResult = {
          name: check.name,
          status,
          message,
          output: result.output
        };
        
        results.push(checkResult);
        
        // Update this specific check result
        setCheckResults(prev => {
          const updated = [...prev];
          updated[i] = checkResult;
          return updated;
        });
        
        // Add small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        const checkResult: CheckResult = {
          name: check.name,
          status: 'error',
          message: `Failed to run check: ${error.message}`,
        };
        
        results.push(checkResult);
        
        setCheckResults(prev => {
          const updated = [...prev];
          updated[i] = checkResult;
          return updated;
        });
      }
    }
    
    // Check if all passed (warnings are OK)
    const passed = results.every(r => r.status === 'success' || r.status === 'warning');
    setAllChecksPassed(passed);
    setIsRunning(false);
  };

  useEffect(() => {
    // Auto-run checks on mount
    if (checks.length > 0 && checkResults.every(r => r.status === 'pending')) {
      runPreChecks();
    }
  }, [checks]);

  const getStatusIcon = (status: CheckResult['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-slate-600" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusColor = (status: CheckResult['status']) => {
    switch (status) {
      case 'pending':
        return 'text-slate-500';
      case 'running':
        return 'text-blue-400';
      case 'success':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Pre-Installation Checks</h2>
        <p className="text-slate-400">
          Verifying system requirements and compatibility
        </p>
      </div>

      <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">System Verification</h3>
            {!isRunning && (
              <Button
                onClick={runPreChecks}
                variant="outline"
                size="sm"
                className="bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-run Checks
              </Button>
            )}
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {checkResults.map((result, index) => (
            <div
              key={index}
              className={`
                flex items-start gap-4 p-4 rounded-lg transition-all duration-300
                ${result.status === 'running' 
                  ? 'bg-blue-500/10 border border-blue-500/20' 
                  : result.status === 'error'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : result.status === 'warning'
                      ? 'bg-yellow-500/10 border border-yellow-500/20'
                      : result.status === 'success'
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-slate-800/50 border border-slate-700/50'
                }
              `}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(result.status)}
              </div>
              
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-white">{result.name}</p>
                    {result.message && (
                      <p className={`text-sm mt-1 ${getStatusColor(result.status)}`}>
                        {result.message}
                      </p>
                    )}
                    {result.output && result.status === 'error' && (
                      <div className="mt-2 p-2 bg-slate-950/50 rounded text-xs font-mono text-slate-400">
                        {result.output}
                      </div>
                    )}
                  </div>
                  
                  {result.status === 'running' && (
                    <span className="text-sm text-blue-400 animate-pulse">
                      Checking...
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {!isRunning && checkResults.length > 0 && (
            <div className={`
              mt-6 p-4 rounded-lg text-center
              ${allChecksPassed 
                ? 'bg-green-500/10 border border-green-500/20' 
                : 'bg-red-500/10 border border-red-500/20'
              }
            `}>
              {allChecksPassed ? (
                <div className="flex items-center justify-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">All checks passed! Ready to proceed.</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-red-400">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">Some checks failed. Please resolve issues before continuing.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between mt-8">
        <Button
          onClick={onBack}
          variant="outline"
          size="lg"
          className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg"
        >
          Back
        </Button>
        
        <Button
          onClick={onNext}
          size="lg"
          disabled={!allChecksPassed || isRunning}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
        >
          Continue to Installation
        </Button>
      </div>
    </div>
  );
}