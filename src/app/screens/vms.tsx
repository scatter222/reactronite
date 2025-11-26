import { useState, useEffect } from 'react';
import { Play, Square, Trash2, RefreshCw, Server, Terminal, Upload } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import type { VMState, VMOperationResult } from '@/app/types/vm-config';

export function VMScreen() {
  const [vms, setVMs] = useState<VMState[]>([]);
  const [loading, setLoading] = useState(true);
  const [output, setOutput] = useState<string[]>([]);
  const [selectedVM, setSelectedVM] = useState<string | null>(null);

  const refreshVMs = async () => {
    setLoading(true);
    try {
      const states = await electron.ipcRenderer.invoke('vm:getStates');
      setVMs(states || []);
    } catch (err) {
      addOutput(`Error: ${err}`);
    }
    setLoading(false);
  };

  const addOutput = (msg: string) => {
    setOutput(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    refreshVMs();

    const handleCommandOutput = (_: any, data: { vmName: string; type: string; data: string }) => {
      addOutput(`[${data.vmName}] ${data.data.trim()}`);
    };

    const handlePostBootStart = (_: any, data: { vmName: string }) => {
      addOutput(`[${data.vmName}] Post-boot configuration starting...`);
    };

    const handlePostBootComplete = (_: any, data: { vmName: string }) => {
      addOutput(`[${data.vmName}] Post-boot configuration complete`);
      refreshVMs();
    };

    const handleWaitCondition = (_: any, data: { vmName: string; condition: string; status: string }) => {
      addOutput(`[${data.vmName}] Wait ${data.condition}: ${data.status}`);
    };

    const handleFileTransfer = (_: any, data: { vmName: string; file: string; status: string; error?: string }) => {
      addOutput(`[${data.vmName}] File ${data.file}: ${data.status}${data.error ? ` - ${data.error}` : ''}`);
    };

    electron.ipcRenderer.on('vm:commandOutput', handleCommandOutput);
    electron.ipcRenderer.on('vm:postBootStart', handlePostBootStart);
    electron.ipcRenderer.on('vm:postBootComplete', handlePostBootComplete);
    electron.ipcRenderer.on('vm:waitCondition', handleWaitCondition);
    electron.ipcRenderer.on('vm:fileTransfer', handleFileTransfer);

    return () => {
      electron.ipcRenderer.removeListener('vm:commandOutput', handleCommandOutput);
      electron.ipcRenderer.removeListener('vm:postBootStart', handlePostBootStart);
      electron.ipcRenderer.removeListener('vm:postBootComplete', handlePostBootComplete);
      electron.ipcRenderer.removeListener('vm:waitCondition', handleWaitCondition);
      electron.ipcRenderer.removeListener('vm:fileTransfer', handleFileTransfer);
    };
  }, []);

  const startVM = async (name: string) => {
    addOutput(`Starting ${name}...`);
    const result: VMOperationResult = await electron.ipcRenderer.invoke('vm:start', name);
    addOutput(result.success ? `${name} started` : `Failed to start ${name}: ${result.error}`);
    refreshVMs();
  };

  const stopVM = async (name: string, force = false) => {
    addOutput(`${force ? 'Force stopping' : 'Stopping'} ${name}...`);
    const result: VMOperationResult = await electron.ipcRenderer.invoke('vm:stop', name, force);
    addOutput(result.success ? `${name} stopped` : `Failed to stop ${name}: ${result.error}`);
    refreshVMs();
  };

  const deleteVM = async (name: string) => {
    if (!confirm(`Delete VM "${name}"? This will remove all storage.`)) return;
    addOutput(`Deleting ${name}...`);
    const result: VMOperationResult = await electron.ipcRenderer.invoke('vm:delete', name);
    addOutput(result.success ? `${name} deleted` : `Failed to delete ${name}: ${result.error}`);
    refreshVMs();
  };

  const runCommand = async (name: string) => {
    const cmd = prompt('Enter command to run:');
    if (!cmd) return;
    addOutput(`[${name}] Running: ${cmd}`);
    const result: VMOperationResult = await electron.ipcRenderer.invoke('vm:executeCommand', name, { cmd });
    addOutput(`[${name}] Exit: ${result.success ? 'success' : result.error}`);
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'stopped': case 'shut off': return 'bg-slate-500';
      default: return 'bg-red-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-semibold text-white">Virtual Machines</h1>
        </div>
        <Button variant="outline" size="sm" onClick={refreshVMs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* VM List */}
        <div className="w-96 border-r border-slate-800 overflow-auto">
          {vms.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {loading ? 'Loading...' : 'No VMs found'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {vms.map(vm => (
                <div
                  key={vm.name}
                  onClick={() => setSelectedVM(vm.name)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedVM === vm.name
                      ? 'bg-slate-800 border border-slate-700'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getStateColor(vm.state)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{vm.name}</p>
                      <p className="text-xs text-slate-400">{vm.state}</p>
                    </div>
                  </div>
                  {vm.ipAddress && (
                    <p className="text-xs text-slate-500 mt-1 ml-5">{vm.ipAddress}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 flex flex-col">
          {selectedVM ? (
            <>
              {/* VM Actions */}
              <div className="p-4 border-b border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">{selectedVM}</h2>
                  <div className="flex gap-2">
                    {vms.find(v => v.name === selectedVM)?.state === 'running' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => runCommand(selectedVM)}>
                          <Terminal className="w-4 h-4" /> Run Command
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => stopVM(selectedVM)}>
                          <Square className="w-4 h-4" /> Stop
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => stopVM(selectedVM, true)}>
                          Force Stop
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="default" size="sm" onClick={() => startVM(selectedVM)}>
                          <Play className="w-4 h-4" /> Start
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteVM(selectedVM)}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* VM Info */}
                {(() => {
                  const vm = vms.find(v => v.name === selectedVM);
                  if (!vm) return null;
                  return (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">State</p>
                        <p className="text-white">{vm.state}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">IP Address</p>
                        <p className="text-white">{vm.ipAddress || '-'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">MAC Address</p>
                        <p className="text-white font-mono text-xs">{vm.macAddress || '-'}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Output Log */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-sm text-slate-400">Output Log</span>
                  <Button variant="ghost" size="sm" onClick={() => setOutput([])}>
                    Clear
                  </Button>
                </div>
                <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-slate-950">
                  {output.length === 0 ? (
                    <p className="text-slate-600">No output yet</p>
                  ) : (
                    output.map((line, i) => (
                      <div key={i} className="text-slate-300 whitespace-pre-wrap">{line}</div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              Select a VM to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
