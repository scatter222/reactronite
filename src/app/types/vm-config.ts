// Very flexible VM configuration types for KVM/libvirt management
// Designed to be loose and easily extensible for testing

export interface VMConfig {
  // Basic VM identification
  name: string;
  description?: string;

  // Dependencies - other VMs that must be running first
  depends_on?: string[];

  // Domain XML definition location (libvirt XML)
  domainXmlPath: string;

  // Network configuration
  network?: {
    type?: 'bridge' | 'nat' | 'isolated' | 'custom';
    bridge?: string;
    mac?: string;
    ip?: string;
    gateway?: string;
    dns?: string[];
    [key: string]: any; // Allow any additional network properties
  };

  // Resource allocation (can be overridden)
  resources?: {
    cpus?: number;
    memory?: string; // e.g., "2048M", "4G"
    disk?: string; // e.g., "20G"
    [key: string]: any; // Allow any additional resource properties
  };

  // Post-boot configuration
  postBoot?: {
    // Files to be added to the VM
    files?: FileTransfer[];

    // Commands to run after boot
    commands?: PostBootCommand[];

    // Wait conditions before considering VM ready
    waitFor?: WaitCondition[];

    // SSH configuration for accessing the VM
    ssh?: {
      user?: string;
      password?: string;
      keyPath?: string;
      port?: number;
      [key: string]: any;
    };

    // Agent configuration if using an agent for post-boot
    agent?: {
      installScript?: string;
      configPath?: string;
      [key: string]: any;
    };

    [key: string]: any; // Allow any additional post-boot properties
  };

  // VM lifecycle hooks
  hooks?: {
    beforeCreate?: string[]; // Commands to run before VM creation
    afterCreate?: string[]; // Commands to run after VM creation
    beforeStart?: string[]; // Commands to run before starting
    afterStart?: string[]; // Commands to run after starting
    beforeStop?: string[]; // Commands to run before stopping
    afterStop?: string[]; // Commands to run after stopping
    [key: string]: any;
  };

  // Tags for grouping/filtering VMs
  tags?: string[];

  // Priority for startup order (lower = earlier)
  priority?: number;

  // Auto-start configuration
  autoStart?: boolean;
  autoStartDelay?: number; // Seconds to wait before auto-starting

  // Snapshot configuration
  snapshots?: {
    autoSnapshot?: boolean;
    snapshotBeforeChanges?: boolean;
    maxSnapshots?: number;
    [key: string]: any;
  };

  // Allow any additional properties for flexibility
  [key: string]: any;
}

export interface FileTransfer {
  source: string; // Local file path
  destination: string; // Path in the VM
  permissions?: string; // e.g., "755", "644"
  owner?: string;
  group?: string;
  // Support for template variables in file content
  variables?: Record<string, any>;
  // Whether to process as template
  template?: boolean;
  [key: string]: any;
}

export interface PostBootCommand {
  cmd: string;
  description?: string;
  user?: string; // User to run command as
  workDir?: string; // Working directory
  env?: Record<string, string>; // Environment variables
  timeout?: number; // Command timeout in seconds
  retries?: number; // Number of retries on failure
  retryDelay?: number; // Delay between retries in seconds
  expectedExitCode?: number; // Expected exit code (default: 0)
  ignoreError?: boolean; // Continue even if command fails
  sensitive?: boolean; // Don't log command output
  captureOutput?: string; // Variable name to capture output to
  condition?: string; // JavaScript expression to evaluate
  [key: string]: any;
}

export interface WaitCondition {
  type: 'port' | 'http' | 'https' | 'command' | 'file' | 'process';
  target?: string; // Port number, URL, file path, process name, etc.
  timeout?: number; // Max wait time in seconds
  retryInterval?: number; // Time between checks in seconds
  expectedResponse?: string; // For HTTP/HTTPS checks
  command?: string; // For command type
  [key: string]: any;
}

// Container for multiple VM configurations
export interface VMConfigFile {
  version?: string; // Config file version for migrations
  vms: VMConfig[];

  // Global defaults that can be overridden per VM
  defaults?: {
    network?: VMConfig['network'];
    resources?: VMConfig['resources'];
    postBoot?: VMConfig['postBoot'];
    [key: string]: any;
  };

  // Environment-specific overrides
  environments?: {
    [envName: string]: {
      [vmName: string]: Partial<VMConfig>;
    };
  };

  // Global variables available to all VMs
  variables?: Record<string, any>;

  // Installation profiles (groups of VMs to install together)
  profiles?: {
    [profileName: string]: {
      vms: string[]; // VM names
      description?: string;
      variables?: Record<string, any>;
      [key: string]: any;
    };
  };

  [key: string]: any;
}

// VM state tracking
export interface VMState {
  name: string;
  state: 'undefined' | 'stopped' | 'running' | 'paused' | 'suspended' | 'crashed' | 'dying';
  ipAddress?: string;
  macAddress?: string;
  uptime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: Record<string, number>;
  lastError?: string;
  createdAt?: Date;
  lastStarted?: Date;
  [key: string]: any;
}

// Operation result types
export interface VMOperationResult {
  success: boolean;
  vmName: string;
  operation: string;
  output?: string;
  error?: string;
  duration?: number;
  timestamp: Date;
  [key: string]: any;
}

// Batch operation results
export interface VMBatchResult {
  totalVMs: number;
  successful: number;
  failed: number;
  results: VMOperationResult[];
  duration: number;
}