import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label-simple';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Cpu,
  Loader2, Play, Terminal, XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type {
  HardwareConfig, HardwareScript, HardwareVariable, ScriptResult, ScriptStatus,
} from '@/app/types/hardware-config';

type Phase = 'config' | 'running' | 'done';

export function HardwareScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('config');
  const [hwConfig, setHwConfig] = useState<HardwareConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Script execution state
  const [results, setResults] = useState<ScriptResult[]>([]);
  const [activeScriptIndex, setActiveScriptIndex] = useState(-1);
  const [liveOutput, setLiveOutput] = useState('');
  const [allDone, setAllDone] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  // Listen for live script output
  useEffect(() => {
    const handler = (_event: Electron.IpcRendererEvent, data: { scriptId: string; type: string; data: string }) => {
      setLiveOutput((prev) => prev + data.data);
    };
    electron.ipcRenderer.on('hardware:scriptOutput', handler);
    return () => {
      electron.ipcRenderer.removeListener('hardware:scriptOutput', handler);
    };
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  const loadConfig = async () => {
    try {
      const config = await electron.ipcRenderer.invoke('hardware:getConfig');
      setHwConfig(config);
      const defaults: Record<string, string> = {};
      config.variables.forEach((v: HardwareVariable) => {
        if (v.default) defaults[v.id] = v.default;
      });
      setValues(defaults);
    } catch (error) {
      console.error('Failed to load hardware config:', error);
    } finally {
      setLoading(false);
    }
  };

  const validate = (): boolean => {
    if (!hwConfig) return false;
    const newErrors: Record<string, string> = {};
    hwConfig.variables.forEach((v) => {
      if (v.required && (!values[v.id] || values[v.id].trim() === '')) {
        newErrors[v.id] = `${v.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const runScripts = async () => {
    if (!hwConfig || !validate()) return;
    setPhase('running');
    setLiveOutput('');
    setAllDone(false);
    setHasErrors(false);

    const initialResults: ScriptResult[] = hwConfig.scripts.map((s) => ({
      id: s.id,
      name: s.name,
      status: 'pending' as ScriptStatus,
      output: '',
    }));
    setResults(initialResults);

    let errored = false;

    for (let i = 0; i < hwConfig.scripts.length; i++) {
      if (errored) {
        setResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: 'skipped' } : r)),
        );
        continue;
      }

      setActiveScriptIndex(i);
      setLiveOutput('');
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'running' } : r)),
      );

      const result: ScriptResult = await electron.ipcRenderer.invoke(
        'hardware:runScript',
        hwConfig.scripts[i],
        values,
      );

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? result : r)),
      );

      if (result.status === 'error') {
        errored = true;
        setHasErrors(true);
      }
    }

    setActiveScriptIndex(-1);
    setAllDone(true);
    setPhase('done');
  };

  const handleChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const renderField = (v: HardwareVariable) => {
    const error = errors[v.id];
    if (v.type === 'select') {
      return (
        <div key={v.id} className="space-y-2">
          <Label htmlFor={v.id} className="text-slate-200">{v.label}</Label>
          <select
            id={v.id}
            value={values[v.id] ?? ''}
            onChange={(e) => handleChange(v.id, e.target.value)}
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {v.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {v.description && !error && <p className="text-sm text-slate-400">{v.description}</p>}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /><span>{error}</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={v.id} className="space-y-2">
        <Label htmlFor={v.id} className="text-slate-200">{v.label}</Label>
        <Input
          id={v.id}
          type={v.type === 'password' ? 'password' : 'text'}
          value={values[v.id] ?? ''}
          onChange={(e) => handleChange(v.id, e.target.value)}
          placeholder={v.placeholder}
          className={`bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 ${error ? 'border-red-500' : ''}`}
        />
        {v.description && !error && <p className="text-sm text-slate-400">{v.description}</p>}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /><span>{error}</span>
          </div>
        )}
      </div>
    );
  };

  const statusIcon = (status: ScriptStatus) => {
    switch (status) {
      case 'pending': return <div className="w-5 h-5 rounded-full bg-slate-600" />;
      case 'running': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'skipped': return <div className="w-5 h-5 rounded-full bg-slate-700 border border-slate-500" />;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="mt-4 text-slate-400">Loading hardware configuration...</p>
        </div>
      </div>
    );
  }

  if (!hwConfig) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-red-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <p>Failed to load hardware configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex relative">
      {/* Sidebar — script list */}
      <div className="w-80 bg-slate-900/60 border-r border-slate-800/50 backdrop-blur-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Hardware Config</h2>
              <p className="text-xs text-slate-400">{hwConfig.description}</p>
            </div>
          </div>

          <div className="space-y-2">
            {hwConfig.scripts.map((script, idx) => {
              const result = results[idx];
              const isActive = idx === activeScriptIndex;
              return (
                <div
                  key={script.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-slate-800/60 border border-slate-700/30'
                      : result?.status === 'success'
                        ? 'opacity-100'
                        : result?.status === 'error'
                          ? 'opacity-100'
                          : phase === 'config'
                            ? 'opacity-60'
                            : 'opacity-40'
                  }`}
                >
                  {phase === 'config'
                    ? <div className="w-5 h-5 rounded-full bg-slate-600" />
                    : statusIcon(result?.status ?? 'pending')}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>
                      {script.name}
                    </p>
                    {result?.duration !== undefined && result.duration > 0 && (
                      <p className="text-xs text-slate-500">{(result.duration / 1000).toFixed(1)}s</p>
                    )}
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-blue-400 animate-pulse" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {phase === 'config' && (
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Device Configuration</h2>
                <p className="text-slate-400">
                  Enter the connection details for your network hardware. Scripts will run locally and connect over serial/network.
                </p>
              </div>

              <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl mb-6">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-blue-400" />
                    Connection Settings
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    IP addresses and serial port for device access
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hwConfig.variables.map(renderField)}
                </CardContent>
              </Card>

              <div className="flex gap-4 justify-between">
                <Button
                  variant="outline"
                  onClick={() => navigate('/choose')}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  size="lg"
                  onClick={runScripts}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 gap-2"
                >
                  <Play className="w-5 h-5" />
                  Run Configuration
                </Button>
              </div>
            </div>
          </div>
        )}

        {(phase === 'running' || phase === 'done') && (
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            {/* Current script header */}
            <div className="mb-4">
              {phase === 'running' && activeScriptIndex >= 0 && (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <div>
                    <p className="text-white font-medium">{hwConfig.scripts[activeScriptIndex].name}</p>
                    <p className="text-sm text-slate-400">{hwConfig.scripts[activeScriptIndex].description}</p>
                  </div>
                </div>
              )}
              {phase === 'done' && !hasErrors && (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium text-lg">Configuration Complete</p>
                    <p className="text-sm text-slate-400">All scripts executed successfully</p>
                  </div>
                </div>
              )}
              {phase === 'done' && hasErrors && (
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <div>
                    <p className="text-white font-medium text-lg">Configuration Failed</p>
                    <p className="text-sm text-slate-400">One or more scripts encountered errors</p>
                  </div>
                </div>
              )}
            </div>

            {/* Script results summary */}
            {phase === 'done' && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-lg border ${
                      r.status === 'success'
                        ? 'border-green-700/50 bg-green-950/30'
                        : r.status === 'error'
                          ? 'border-red-700/50 bg-red-950/30'
                          : 'border-slate-700/50 bg-slate-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(r.status)}
                      <span className="text-xs font-medium text-white truncate">{r.name}</span>
                    </div>
                    {r.exitCode !== undefined && r.exitCode !== -1 && (
                      <p className="text-xs text-slate-400">Exit code: {r.exitCode}</p>
                    )}
                    {r.error && <p className="text-xs text-red-400 truncate">{r.error}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Live output terminal */}
            <div className="flex-1 min-h-0 rounded-xl border border-slate-700/50 bg-slate-950/80 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-700/50">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400 font-mono">Output</span>
              </div>
              <pre
                ref={outputRef}
                className="flex-1 overflow-auto p-4 text-sm font-mono text-slate-300 whitespace-pre-wrap"
              >
                {liveOutput || (phase === 'done'
                  ? results.map((r) => `--- ${r.name} ---\n${r.output}\n`).join('\n')
                  : 'Waiting for script output...')}
              </pre>
            </div>

            {/* Actions */}
            {phase === 'done' && (
              <div className="flex gap-4 justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPhase('config');
                    setResults([]);
                    setLiveOutput('');
                    setActiveScriptIndex(-1);
                    setAllDone(false);
                    setHasErrors(false);
                  }}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Config
                </Button>
                {hasErrors && (
                  <Button
                    onClick={runScripts}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Retry
                  </Button>
                )}
                {!hasErrors && (
                  <Button
                    onClick={() => navigate('/')}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
