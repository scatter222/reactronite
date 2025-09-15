export interface InstallerConfig {
  installer: {
    name: string;
    version: string;
    description: string;
  };
  preChecks: PreCheck[];
  configFields: ConfigField[];
  installSteps: InstallStep[];
  postInstall: PostInstallCommand[];
}

export interface PreCheck {
  name: string;
  command: string;
  expectedPattern?: string;
  expectedExitCode?: number;
  minRequired?: string;
  type?: 'diskSpace' | 'memory' | 'cpu';
  errorMessage: string;
}

export interface ConfigField {
  id: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  required?: boolean;
  placeholder?: string;
  validation?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  default?: any;
  options?: Array<{ value: string; label: string }>;
}

export interface InstallCommand {
  cmd: string;
  description: string;
  safe?: boolean;
  sensitive?: boolean;
  expectedExitCode?: number;
  timeout?: number;
}

export interface InstallStep {
  name: string;
  description: string;
  condition?: string;
  commands: InstallCommand[];
}

export interface PostInstallCommand {
  name: string;
  command: string;
  safe?: boolean;
}

export interface UserConfig {
  [key: string]: any;
}