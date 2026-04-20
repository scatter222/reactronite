import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Server, Rocket, ChevronRight } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useLocation } from 'react-router-dom';
import type { VMState, VMConfig, VMOperationResult, VMConfigFile } from '@/app/types/vm-config';

type InstallPhase = 'pending' | 'creating' | 'starting' | 'waiting' | 'transferring' | 'post-boot' | 'complete' | 'error';

interface LogEntry {
  vmName?: string;
  message: string;
  timestamp: string;
}

const PHASE_LABELS: Record<InstallPhase, string> = {
  pending: 'Pending',
  creating: 'Creating',
  starting: 'Starting',
  waiting: 'Waiting for agent',
  transferring: 'Transferring files',
  'post-boot': 'Running post-boot',
  complete: 'Complete',
  error: 'Error',
};

const PHASE_COLORS: Record<InstallPhase, string> = {
  pending: 'bg-slate-500',
  creating: 'bg-blue-500 animate-pulse',
  starting: 'bg-blue-500 animate-pulse',
  waiting: 'bg-yellow-500 animate-pulse',
  transferring: 'bg-yellow-500 animate-pulse',
  'post-boot': 'bg-orange-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
};

export function VMScreen() {
  const location = useLocation();
  const installerVariables: Record<string, any> = (location.state as any)?.capturedVariables || {};
  const [vms, setVMs] = useState<VMState[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedVM, setSelectedVM] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [hasDeployed, setHasDeployed] = useState(false);
  const autoDeployRan = useRef(false);
  const [vmPhases, setVMPhases] = useState<Record<string, InstallPhase>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  const setPhase = useCallback((vmName: string, phase: InstallPhase) => {
    setVMPhases(prev => ({ ...prev, [vmName]: phase }));
  }, []);

  const addLog = useCallback((msg: string, vmName?: string) => {
    const entry: LogEntry = {
      vmName,
      message: msg,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs(prev => [...prev.slice(-500), entry]);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const refreshVMs = async () => {
    setLoading(true);
    try {
      const states = await electron.ipcRenderer.invoke('vm:getStates');
      setVMs(states || []);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
    setLoading(false);
  };

  // Send installer variables to main process on mount
  useEffect(() => {
    if (Object.keys(installerVariables).length > 0) {
      electron.ipcRenderer.invoke('vm:setInstallerVariables', installerVariables);
    }
  }, []);

  const deployVM = async (vm: VMConfig, existingNames: Set<string>) => {
    if (existingNames.has(vm.name)) {
      addLog(`Already defined, skipping create`, vm.name);
    } else {
      setPhase(vm.name, 'creating');
      addLog(`Creating...`, vm.name);
      const createResult: VMOperationResult = await electron.ipcRenderer.invoke('vm:create', vm);
      if (!createResult.success) {
        addLog(`Failed to create: ${createResult.error}`, vm.name);
        setPhase(vm.name, 'error');
        return;
      }
      addLog(`Created`, vm.name);
    }

    setPhase(vm.name, 'starting');
    addLog(`Starting...`, vm.name);
    const startResult: VMOperationResult = await electron.ipcRenderer.invoke('vm:start', vm.name);
    if (startResult.success) {
      addLog(`Started`, vm.name);
    } else {
      addLog(`Failed to start: ${startResult.error}`, vm.name);
      setPhase(vm.name, 'error');
    }
  };

  const deployConfig = async () => {
    setDeploying(true);
    try {
      const config: VMConfigFile = await electron.ipcRenderer.invoke('vm:getConfig');
      if (!config.vms || config.vms.length === 0) {
        addLog('No VMs defined in vm-config.json');
        setDeploying(false);
        return;
      }

      // Initialize all phases to pending
      const phases: Record<string, InstallPhase> = {};
      for (const tier of config.vms) {
        for (const vm of tier) {
          phases[vm.name] = 'pending';
        }
      }
      setVMPhases(phases);

      const existingStates = await electron.ipcRenderer.invoke('vm:getStates');
      const existingNames = new Set<string>((existingStates || []).map((s: VMState) => s.name));

      // Process tiers sequentially; VMs within a tier run in parallel
      for (let i = 0; i < config.vms.length; i++) {
        const tier = config.vms[i];
        addLog(`Starting tier ${i + 1} (${tier.map(v => v.name).join(', ')})`);
        await Promise.all(tier.map(vm => deployVM(vm, existingNames)));
      }

      await refreshVMs();
    } catch (err) {
      addLog(`Deploy error: ${err}`);
    }
    setDeploying(false);
    setHasDeployed(true);
  };

  useEffect(() => {
    refreshVMs().then(() => {
      if (!autoDeployRan.current) {
        autoDeployRan.current = true;
        deployConfig();
      }
    });

    const handleCommandOutput = (_: any, data: { vmName: string; type: string; data: string }) => {
      addLog(data.data.trim(), data.vmName);
    };

    const handlePostBootStart = (_: any, data: { vmName: string }) => {
      addLog(`Post-boot configuration starting...`, data.vmName);
      setPhase(data.vmName, 'post-boot');
    };

    const handlePostBootComplete = (_: any, data: { vmName: string }) => {
      addLog(`Post-boot configuration complete`, data.vmName);
      setPhase(data.vmName, 'complete');
      refreshVMs();
    };

    const handleWaitCondition = (_: any, data: { vmName: string; condition: string; status: string }) => {
      addLog(`Wait ${data.condition}: ${data.status}`, data.vmName);
      setPhase(data.vmName, 'waiting');
    };

    const handleFileTransfer = (_: any, data: { vmName: string; file: string; status: string; error?: string }) => {
      addLog(`File ${data.file}: ${data.status}${data.error ? ` - ${data.error}` : ''}`, data.vmName);
      if (data.status === 'transferring') {
        setPhase(data.vmName, 'transferring');
      }
    };

    const handleCommandStart = (_: any, data: { vmName: string; command: string }) => {
      addLog(`Running: ${data.command}`, data.vmName);
    };

    const handleCommandComplete = (_: any, data: { vmName: string; command: string; success: boolean; error?: string }) => {
      addLog(`${data.command}: ${data.success ? 'done' : `failed - ${data.error}`}`, data.vmName);
    };

    const handleInstallProgress = (_: any, data: { vmName: string; status: string; message: string }) => {
      addLog(data.message, data.vmName);
      if (data.status === 'error') setPhase(data.vmName, 'error');
    };

    electron.ipcRenderer.on('vm:commandOutput', handleCommandOutput as any);
    electron.ipcRenderer.on('vm:postBootStart', handlePostBootStart as any);
    electron.ipcRenderer.on('vm:postBootComplete', handlePostBootComplete as any);
    electron.ipcRenderer.on('vm:waitCondition', handleWaitCondition as any);
    electron.ipcRenderer.on('vm:fileTransfer', handleFileTransfer as any);
    electron.ipcRenderer.on('vm:commandStart', handleCommandStart as any);
    electron.ipcRenderer.on('vm:commandComplete', handleCommandComplete as any);
    electron.ipcRenderer.on('vm:installProgress', handleInstallProgress as any);

    return () => {
      electron.ipcRenderer.removeListener('vm:commandOutput', handleCommandOutput as any);
      electron.ipcRenderer.removeListener('vm:postBootStart', handlePostBootStart as any);
      electron.ipcRenderer.removeListener('vm:postBootComplete', handlePostBootComplete as any);
      electron.ipcRenderer.removeListener('vm:waitCondition', handleWaitCondition as any);
      electron.ipcRenderer.removeListener('vm:fileTransfer', handleFileTransfer as any);
      electron.ipcRenderer.removeListener('vm:commandStart', handleCommandStart as any);
      electron.ipcRenderer.removeListener('vm:commandComplete', handleCommandComplete as any);
      electron.ipcRenderer.removeListener('vm:installProgress', handleInstallProgress as any);
    };
  }, []);

  const filteredLogs = selectedVM
    ? logs.filter(l => l.vmName === selectedVM)
    : logs;

  const allComplete = vms.length > 0 && Object.values(vmPhases).length > 0 &&
    Object.values(vmPhases).every(p => p === 'complete');
  const anyError = Object.values(vmPhases).some(p => p === 'error');

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-semibold text-white">VM Deployment</h1>
          {deploying && (
            <span className="text-sm text-yellow-400 animate-pulse">Deploying...</span>
          )}
          {!deploying && allComplete && (
            <span className="text-sm text-green-400">All complete</span>
          )}
          {!deploying && anyError && !allComplete && (
            <span className="text-sm text-red-400">Errors occurred</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={deployConfig} disabled={deploying}>
            <Rocket className={`w-4 h-4 ${deploying ? 'animate-pulse' : ''}`} />
            {deploying ? 'Deploying...' : hasDeployed ? 'Redeploy' : 'Deploy'}
          </Button>
          <Button variant="outline" size="sm" onClick={refreshVMs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* VM List Sidebar */}
        <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
          <div className="shrink-0 p-2 border-b border-slate-800">
            <div
              onClick={() => setSelectedVM(null)}
              className={`px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                selectedVM === null
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
              }`}
            >
              All VMs
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {vms.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                {loading ? 'Loading...' : 'No VMs found'}
              </div>
            ) : (
              vms.map(vm => {
                const phase = vmPhases[vm.name] || (vm.state === 'running' ? 'complete' : 'pending');
                return (
                  <div
                    key={vm.name}
                    onClick={() => setSelectedVM(vm.name)}
                    className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      selectedVM === vm.name
                        ? 'bg-slate-800 border border-slate-700'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 shrink-0 rounded-full ${PHASE_COLORS[phase]}`} />
                      <span className="text-white text-sm font-medium truncate">{vm.name}</span>
                      {selectedVM === vm.name && (
                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 ml-auto" />
                      )}
                    </div>
                    <div className="ml-4 mt-0.5">
                      <span className="text-xs text-slate-400">{PHASE_LABELS[phase]}</span>
                      {vm.ipAddress && (
                        <span className="text-xs text-slate-500 ml-2">{vm.ipAddress}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Log Panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-400">
              {selectedVM ? `Logs — ${selectedVM}` : 'Logs — All VMs'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
              Clear
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-slate-950">
            {filteredLogs.length === 0 ? (
              <p className="text-slate-600 text-sm">No output yet</p>
            ) : (
              filteredLogs.map((entry, i) => (
                <div key={i} className="font-mono text-xs leading-5 break-all">
                  <span className="text-slate-600">{entry.timestamp}</span>
                  {entry.vmName && (
                    <span className="text-blue-400 ml-1">[{entry.vmName}]</span>
                  )}
                  <span className="text-slate-300 ml-1">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
