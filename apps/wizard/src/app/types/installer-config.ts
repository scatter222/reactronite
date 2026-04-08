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
  safe?: boolean;
  captureAs?: string;
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
  cmd?: string;
  description: string;
  safe?: boolean;
  sensitive?: boolean;
  expectedExitCode?: number;
  timeout?: number;
  captureAs?: string; // Capture output as variable
  defaultValue?: string; // Default if capture fails
  condition?: string; // JavaScript expression to evaluate
  type?: 'command' | 'prompt' | 'display';
  
  // For prompts
  promptType?: 'input' | 'password' | 'confirm' | 'select' | 'multiselect';
  message?: string;
  options?: Array<{ value: string; label: string; selected?: boolean }>;
  default?: any;
  validation?: string;
  allowEmpty?: boolean;
  required?: boolean;
  
  // For display
  title?: string;
  content?: string[];
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