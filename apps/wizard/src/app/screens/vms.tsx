import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, Server, Rocket, ChevronRight, Network, Terminal } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { VMDependencyGraph } from '@/app/components/vm-dependency-graph';
import {
  normalizeTiers,
  flattenTiers,
  PHASE_COLORS,
  PHASE_LABELS,
  type InstallPhase,
} from '@/app/lib/vm-graph';
import { useLocation } from 'react-router-dom';
import type { VMState, VMConfig, VMOperationResult, VMConfigFile } from '@/app/types/vm-config';

interface LogEntry {
  vmName?: string;
  message: string;
  timestamp: string;
}

type PanelView = 'logs' | 'graph';

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
  const [tiers, setTiers] = useState<VMConfig[][]>([]);
  const [panel, setPanel] = useState<PanelView>('logs');
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
    if (panel === 'logs') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, panel]);

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

  /**
   * Load vm-config.json and normalise it into deployment tiers. Accepts both the
   * flat `vms: [...]` shape and the explicit `vms: [[...], [...]]` tier shape.
   */
  const loadTiers = useCallback(async (): Promise<VMConfig[][]> => {
    const config: VMConfigFile = await electron.ipcRenderer.invoke('vm:getConfig');
    const normalized = normalizeTiers(config?.vms);
    setTiers(normalized);
    setVMPhases(prev => {
      const next = { ...prev };
      for (const vm of flattenTiers(normalized)) {
        if (!next[vm.name]) next[vm.name] = 'pending';
      }
      return next;
    });
    return normalized;
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
      const deployTiers = await loadTiers();
      if (deployTiers.length === 0) {
        addLog('No VMs defined in vm-config.json');
        setDeploying(false);
        return;
      }

      // Initialize all phases to pending
      const phases: Record<string, InstallPhase> = {};
      for (const tier of deployTiers) {
        for (const vm of tier) {
          phases[vm.name] = 'pending';
        }
      }
      setVMPhases(phases);

      const existingStates = await electron.ipcRenderer.invoke('vm:getStates');
      const existingNames = new Set<string>((existingStates || []).map((s: VMState) => s.name));

      // Process tiers sequentially; VMs within a tier run in parallel
      for (let i = 0; i < deployTiers.length; i++) {
        const tier = deployTiers[i];
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
    loadTiers().catch(err => addLog(`Config error: ${err}`));

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

  const vmStateByName = useMemo(() => {
    const map: Record<string, VMState> = {};
    vms.forEach(vm => { map[vm.name] = vm; });
    return map;
  }, [vms]);

  /** Latest log line per VM, shown as the node subtitle in the graph. */
  const lastLogByVM = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of logs) {
      if (entry.vmName && entry.message) map[entry.vmName] = entry.message;
    }
    return map;
  }, [logs]);

  /** Sidebar list: every configured VM, plus anything libvirt already knows about. */
  const listedVMs = useMemo(() => {
    const names = flattenTiers(tiers).map(vm => vm.name);
    vms.forEach(vm => { if (!names.includes(vm.name)) names.push(vm.name); });
    return names;
  }, [tiers, vms]);

  const phaseFor = useCallback(
    (name: string): InstallPhase =>
      vmPhases[name] || (vmStateByName[name]?.state === 'running' ? 'complete' : 'pending'),
    [vmPhases, vmStateByName]
  );

  const openLogsFor = useCallback((vmName: string) => {
    setSelectedVM(vmName);
    setPanel('logs');
  }, []);

  const trackedPhases = listedVMs.map(phaseFor);
  const allComplete = trackedPhases.length > 0 && trackedPhases.every(p => p === 'complete');
  const anyError = trackedPhases.some(p => p === 'error');

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
        <div className="flex items-center gap-2">
          {/* View switcher: raw logs vs dependency graph */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
            {([
              { id: 'logs' as const, label: 'Logs', Icon: Terminal },
              { id: 'graph' as const, label: 'Graph', Icon: Network }
            ]).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setPanel(id)}
                aria-pressed={panel === id}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  panel === id
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
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
            {listedVMs.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                {loading ? 'Loading...' : 'No VMs found'}
              </div>
            ) : (
              listedVMs.map(name => {
                const phase = phaseFor(name);
                const state = vmStateByName[name];
                return (
                  <div
                    key={name}
                    onClick={() => setSelectedVM(name)}
                    className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      selectedVM === name
                        ? 'bg-slate-800 border border-slate-700'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 shrink-0 rounded-full ${PHASE_COLORS[phase]}`} />
                      <span className="text-white text-sm font-medium truncate">{name}</span>
                      {selectedVM === name && (
                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 ml-auto" />
                      )}
                    </div>
                    <div className="ml-4 mt-0.5">
                      <span className="text-xs text-slate-400">{PHASE_LABELS[phase]}</span>
                      {state?.ipAddress && (
                        <span className="text-xs text-slate-500 ml-2">{state.ipAddress}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {panel === 'graph' ? (
          <VMDependencyGraph
            tiers={tiers}
            phases={vmPhases}
            vmStates={vmStateByName}
            lastLogByVM={lastLogByVM}
            selectedVM={selectedVM}
            onOpenLogs={openLogsFor}
          />
        ) : (
          /* Log Panel */
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
        )}
      </div>
    </div>
  );
}
