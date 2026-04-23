import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label-simple';
import { Card } from '@/app/components/ui/card';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Cpu, Network,
  Loader2, Play, Router, ShieldCheck, Terminal as TerminalIcon, XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type {
  HardwareConfig, HardwareScript, HardwareVariable, ScriptResult,
} from '@/app/types/hardware-config';

type Phase = 'select' | 'configure' | 'running' | 'done';

const SCRIPT_THEMES = [
  { gradient: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/25', text: 'group-hover:text-blue-400', border: 'hover:border-blue-500/50', glow: 'hover:shadow-blue-500/10', ring: 'focus:ring-blue-500/40', Icon: ShieldCheck },
  { gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', text: 'group-hover:text-emerald-400', border: 'hover:border-emerald-500/50', glow: 'hover:shadow-emerald-500/10', ring: 'focus:ring-emerald-500/40', Icon: Network },
  { gradient: 'from-orange-500 to-orange-600', shadow: 'shadow-orange-500/25', text: 'group-hover:text-orange-400', border: 'hover:border-orange-500/50', glow: 'hover:shadow-orange-500/10', ring: 'focus:ring-orange-500/40', Icon: Router },
  { gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', text: 'group-hover:text-violet-400', border: 'hover:border-violet-500/50', glow: 'hover:shadow-violet-500/10', ring: 'focus:ring-violet-500/40', Icon: Cpu },
];

const themeFor = (idx: number) => SCRIPT_THEMES[idx % SCRIPT_THEMES.length];

export function HardwareScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('select');
  const [hwConfig, setHwConfig] = useState<HardwareConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [valuesByScript, setValuesByScript] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resultsById, setResultsById] = useState<Record<string, ScriptResult>>({});

  const [liveOutput, setLiveOutput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const handler = (_e: Electron.IpcRendererEvent, data: { scriptId: string; type: string; data: string }) => {
      setLiveOutput((prev) => prev + data.data);
    };
    electron.ipcRenderer.on('hardware:scriptOutput', handler);
    return () => {
      electron.ipcRenderer.removeListener('hardware:scriptOutput', handler);
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  const loadConfig = async () => {
    try {
      const config: HardwareConfig = await electron.ipcRenderer.invoke('hardware:getConfig');
      setHwConfig(config);

      const initial: Record<string, Record<string, string>> = {};
      config.scripts.forEach((s) => {
        const defaults: Record<string, string> = {};
        s.variables.forEach((v) => {
          if (v.default) defaults[v.id] = v.default;
        });
        initial[s.id] = defaults;
      });
      setValuesByScript(initial);
    } catch (error) {
      console.error('Failed to load hardware config:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedScript: HardwareScript | null =
    hwConfig && selectedIndex >= 0 ? hwConfig.scripts[selectedIndex] : null;

  const validate = (script: HardwareScript): boolean => {
    const vals = valuesByScript[script.id] ?? {};
    const newErrors: Record<string, string> = {};
    script.variables.forEach((v) => {
      if (v.required && (!vals[v.id] || vals[v.id].trim() === '')) {
        newErrors[v.id] = `${v.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (scriptId: string, varId: string, value: string) => {
    setValuesByScript((prev) => ({
      ...prev,
      [scriptId]: { ...(prev[scriptId] ?? {}), [varId]: value },
    }));
    if (errors[varId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[varId];
        return next;
      });
    }
  };

  const runSelectedScript = async () => {
    if (!selectedScript) return;
    if (!validate(selectedScript)) return;

    setLiveOutput('');
    setPhase('running');

    const result: ScriptResult = await electron.ipcRenderer.invoke(
      'hardware:runScript',
      selectedScript,
      valuesByScript[selectedScript.id] ?? {},
    );

    setResultsById((prev) => ({ ...prev, [selectedScript.id]: result }));
    setPhase('done');
  };

  const renderField = (scriptId: string, v: HardwareVariable) => {
    const error = errors[v.id];
    const value = valuesByScript[scriptId]?.[v.id] ?? '';

    if (v.type === 'select') {
      return (
        <div key={v.id} className="space-y-2">
          <Label htmlFor={v.id} className="text-slate-200">{v.label}</Label>
          <select
            id={v.id}
            value={value}
            onChange={(e) => handleChange(scriptId, v.id, e.target.value)}
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
          value={value}
          onChange={(e) => handleChange(scriptId, v.id, e.target.value)}
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

  // ─────────────────────────────────────────────────────── SELECT PHASE
  if (phase === 'select') {
    return (
      <div className="h-full flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/20 to-slate-950/90"></div>
        <div className="max-w-5xl w-full mx-auto px-8 py-12 animate-in fade-in duration-500 relative z-10">
          <h2 className="text-3xl font-bold text-white mb-2 text-center tracking-tight">
            Which hardware would you like to configure?
          </h2>
          <p className="text-slate-400 mb-10 text-center">
            Pick a script to configure its variables and run it. Run as many as you need.
          </p>

          <div className="grid grid-cols-2 gap-6">
            {hwConfig.scripts.map((script, idx) => {
              const theme = themeFor(idx);
              const result = resultsById[script.id];
              const Icon = theme.Icon;

              return (
                <button
                  key={script.id}
                  onClick={() => {
                    setSelectedIndex(idx);
                    setErrors({});
                    setPhase('configure');
                  }}
                  className={`group relative rounded-2xl border border-slate-700/50 bg-slate-900/60 p-8 text-left transition-all hover:bg-slate-800/60 hover:shadow-xl ${theme.border} ${theme.glow} focus:outline-none focus:ring-2 ${theme.ring}`}
                >
                  {result && (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      {result.status === 'success' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-xs text-green-400 font-medium">Completed</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span className="text-xs text-red-400 font-medium">Failed</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className={`mb-6 inline-flex rounded-xl bg-gradient-to-br ${theme.gradient} p-4 shadow-lg ${theme.shadow}`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className={`text-xl font-semibold text-white mb-2 transition-colors ${theme.text}`}>
                    {script.name}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {script.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex justify-between">
            <Button
              variant="outline"
              onClick={() => navigate('/choose')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/choose')}
              className="gap-2"
            >
              Done with hardware
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────── CONFIGURE PHASE
  if (phase === 'configure' && selectedScript) {
    const theme = themeFor(selectedIndex);
    const Icon = theme.Icon;

    return (
      <div className="h-full overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-12 animate-in fade-in duration-300">
          <div className="flex items-center gap-4 mb-8">
            <div className={`inline-flex rounded-xl bg-gradient-to-br ${theme.gradient} p-3 shadow-lg ${theme.shadow}`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white tracking-tight">{selectedScript.name}</h2>
              <p className="text-slate-400">{selectedScript.description}</p>
            </div>
          </div>

          <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl mb-6 p-6">
            <div className="space-y-4">
              {selectedScript.variables.map((v) => renderField(selectedScript.id, v))}
            </div>
          </Card>

          <div className="flex gap-4 justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setErrors({});
                setPhase('select');
              }}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              size="lg"
              onClick={runSelectedScript}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 gap-2"
            >
              <Play className="w-5 h-5" />
              Execute Script
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────── RUNNING / DONE PHASES
  if ((phase === 'running' || phase === 'done') && selectedScript) {
    const result = resultsById[selectedScript.id];
    const isError = phase === 'done' && result?.status === 'error';
    const isSuccess = phase === 'done' && result?.status === 'success';

    return (
      <div className="h-full overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8 animate-in fade-in duration-300 flex flex-col h-full">
          <div className="mb-6 flex items-center gap-3">
            {phase === 'running' && <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />}
            {isSuccess && <CheckCircle2 className="w-6 h-6 text-green-400" />}
            {isError && <XCircle className="w-6 h-6 text-red-400" />}
            <div>
              <h2 className="text-2xl font-bold text-white">
                {phase === 'running' && `Running ${selectedScript.name}`}
                {isSuccess && `${selectedScript.name} Completed`}
                {isError && `${selectedScript.name} Failed`}
              </h2>
              <p className="text-sm text-slate-400">
                {phase === 'running' && selectedScript.description}
                {isSuccess && `Exit code: ${result?.exitCode ?? 0}${result?.duration ? ` · ${(result.duration / 1000).toFixed(1)}s` : ''}`}
                {isError && (result?.error ?? 'Script exited with an error')}
              </p>
            </div>
          </div>

          <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm overflow-hidden rounded-xl shadow-2xl flex-1 min-h-[400px] flex flex-col">
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <TerminalIcon className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-slate-200">Script Output</span>
              {phase === 'running' && (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-auto" />
              )}
              {isSuccess && (
                <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
              )}
              {isError && (
                <XCircle className="w-4 h-4 text-red-400 ml-auto" />
              )}
            </div>

            <div
              ref={outputRef}
              className="p-4 flex-1 overflow-y-auto font-mono text-sm bg-slate-950/50 text-slate-300 whitespace-pre-wrap"
            >
              {liveOutput || (phase === 'running' ? 'Starting script...' : (result?.output ?? ''))}
              {phase === 'running' && (
                <div className="flex items-center gap-2 text-blue-400 mt-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Working...</span>
                </div>
              )}
            </div>
          </Card>

          {phase === 'done' && (
            <div className="flex gap-4 justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setLiveOutput('');
                  setErrors({});
                  setPhase('select');
                }}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Configure another script
              </Button>

              <div className="flex gap-3">
                {isError && (
                  <Button
                    onClick={() => {
                      setLiveOutput('');
                      setPhase('configure');
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Retry
                  </Button>
                )}
                <Button
                  onClick={() => navigate('/choose')}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
