# VM Config Schema

VM configuration is stored in `vm-config.json` at the project root. The schema is defined in `src/app/types/vm-config.ts`.

## Top-Level Structure (`VMConfigFile`)

```typescript
{
  "version": "1.0",           // Config format version
  "vms": [...],               // Array of VM definitions
  "defaults": {...},          // Global defaults applied to all VMs
  "environments": {...},      // Environment-specific overrides
  "variables": {...},         // Global template variables
  "profiles": {...}           // Named groups of VMs
}
```

## VM Definition (`VMConfig`)

```typescript
{
  // Identity
  "name": "my-vm",                    // Required: unique VM name
  "description": "Description",       // Optional

  // Dependencies
  "depends_on": ["other-vm"],         // VMs that must be running first

  // Libvirt Domain XML
  "domainXmlPath": "/path/to/vm.xml", // Required: path to domain XML

  // Network
  "network": {
    "type": "bridge" | "nat" | "isolated" | "custom",
    "bridge": "br0",
    "mac": "52:54:00:xx:xx:xx",
    "ip": "10.0.0.5",
    "gateway": "10.0.0.1",
    "dns": ["8.8.8.8"]
  },

  // Resources
  "resources": {
    "cpus": 2,
    "memory": "4G",
    "disk": "20G"
  },

  // Post-boot configuration (see below)
  "postBoot": {
    "files": [...],
    "commands": [...],
    "waitFor": [...]
  },

  // Lifecycle hooks (shell commands)
  "hooks": {
    "beforeCreate": ["cmd1"],
    "afterCreate": ["cmd2"],
    "beforeStart": ["cmd3"],
    "afterStart": ["cmd4"],
    "beforeStop": ["cmd5"],
    "afterStop": ["cmd6"]
  },

  // SSH credentials (for guest agent fallback)
  "ssh": {
    "username": "root",
    "password": "secret",       // Or use keyPath
    "keyPath": "/path/to/key",
    "port": 22
  },

  // Metadata
  "tags": ["web", "production"],
  "priority": 1,                // Lower = starts earlier in profiles
  "autoStart": true,            // Enable virsh autostart
  "autoStartDelay": 5           // Seconds to wait after starting
}
```

## File Transfer (`FileTransfer`)

```typescript
{
  "source": "/local/path/file.conf",     // Host file path
  "destination": "/etc/app/file.conf",   // Guest file path
  "permissions": "644",                   // Optional chmod
  "owner": "root",                        // Optional
  "group": "root",                        // Optional
  "template": true,                       // Process {{variables}}
  "variables": { "key": "value" }        // Template variables
}
```

## Post-Boot Command (`PostBootCommand`)

```typescript
{
  "cmd": "yum install -y nginx",          // Shell command
  "description": "Install nginx",         // Human-readable label
  "user": "appuser",                      // Run as specific user (su -)
  "workDir": "/opt/app",                  // Working directory
  "env": { "ENV_VAR": "value" },         // Environment variables
  "timeout": 120,                         // Seconds (default: 60)
  "retries": 3,                           // Retry count on failure
  "retryDelay": 5,                        // Seconds between retries
  "expectedExitCode": 0,                  // Expected exit code
  "ignoreError": false,                   // Continue on failure
  "sensitive": false,                     // Don't stream output
  "condition": "someVar === true"         // JS expression to evaluate
}
```

## Wait Condition (`WaitCondition`)

```typescript
{
  "type": "agent" | "port" | "http" | "https" | "command" | "file",
  "target": "8080",              // Port number, URL, or file path
  "timeout": 60,                 // Max wait seconds
  "retryInterval": 2,           // Seconds between checks
  "expectedResponse": "200",    // For HTTP checks
  "command": "systemctl is-active nginx"  // For command type
}
```

### Wait Condition Types

| Type | What It Checks |
|------|---------------|
| `agent` | QEMU Guest Agent responds to `guest-ping` |
| `port` | TCP port is open (`nc -zv`) |
| `http` | HTTP URL returns 2xx/301/302 |
| `https` | Same as http, over TLS |
| `command` | Shell command exits successfully |
| `file` | File exists in guest (`test -e`) |

## Profiles

Named groups of VMs for batch deployment:

```json
{
  "profiles": {
    "production": {
      "vms": ["db-server", "web-server", "cache"],
      "description": "Full production stack"
    }
  }
}
```

VMs are sorted by `priority` before deployment.

## Variables

Template variables are substituted in domain XML and file templates:

```json
{
  "variables": {
    "cluster_name": "prod-01",
    "base_ip": "10.0.0"
  }
}
```

Referenced as `{{cluster_name}}` in domain XML files and template files.

## VM State (`VMState`)

Runtime state tracked for each VM:

```typescript
{
  "name": "my-vm",
  "state": "running",     // undefined|stopped|running|paused|suspended|crashed|dying
  "ipAddress": "10.0.0.5",
  "macAddress": "52:54:00:xx:xx:xx",
  "lastError": "..."
}
```

## Related Pages

- [[VM Management]] - How config is used at runtime
- [[Installer Config Schema]] - Similar config for installer
