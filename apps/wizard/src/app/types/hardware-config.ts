export interface HardwareVariable {
  id: string;
  label: string;
  type: 'text' | 'select' | 'password';
  required?: boolean;
  placeholder?: string;
  default?: string;
  description?: string;
  options?: { value: string; label: string }[];
}

export interface HardwareScript {
  id: string;
  name: string;
  description: string;
  scriptPath: string;
  timeout?: number;
  variables: HardwareVariable[];
  expectedExitCode?: number;
}

export interface HardwareConfig {
  name: string;
  description: string;
  scripts: HardwareScript[];
}

export type ScriptStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface ScriptResult {
  id: string;
  name: string;
  status: ScriptStatus;
  exitCode?: number;
  output: string;
  error?: string;
  duration?: number;
}
