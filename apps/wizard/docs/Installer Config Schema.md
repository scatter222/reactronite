# Installer Config Schema

Installer configuration is stored in `installer-config.json` or `installer-config-advanced.json` at the project root. The schema is defined in `src/app/types/installer-config.ts`.

## Top-Level Structure (`InstallerConfig`)

```typescript
{
  "installer": {
    "name": "My Installer",
    "version": "1.0.0",
    "description": "Setup wizard for..."
  },
  "preChecks": [...],        // System verification checks
  "configFields": [...],     // Dynamic form field definitions
  "installSteps": [...],     // Installation step sequences
  "postInstall": [...]       // Post-installation commands
}
```

## Config Fields (`ConfigField`)

Define the dynamic configuration form:

```typescript
{
  "id": "hostname",              // Becomes {{hostname}} in commands
  "label": "Hostname",
  "type": "text" | "password" | "number" | "boolean" | "select",
  "required": true,
  "placeholder": "Enter hostname",
  "description": "The server hostname",
  "validation": "^[a-z0-9-]+$",  // Regex validation
  "minLength": 3,
  "maxLength": 64,
  "min": 1,                       // For number type
  "max": 100,
  "default": "localhost",
  "options": [                     // For select type
    { "value": "opt1", "label": "Option 1" }
  ]
}
```

User input from these fields is stored in `userConfig` and used for `{{variable}}` substitution throughout the installation.

## Pre-Checks (`PreCheck`)

System verification before installation:

```typescript
{
  "name": "Disk Space Check",
  "command": "df -h /",          // Shell command to run
  "expectedPattern": "[0-9]+G",  // Regex to match in output
  "type": "diskSpace",           // diskSpace | memory | cpu
  "minRequired": "20G",
  "errorMessage": "Insufficient disk space",
  "safe": true,                  // Bypass safety filter
  "captureAs": "disk_info"       // Store output as variable
}
```

## Install Steps (`InstallStep`)

Groups of commands executed sequentially:

```typescript
{
  "name": "System Configuration",
  "description": "Configure system settings",
  "condition": "enableAdvanced",   // Only run if userConfig.enableAdvanced === true
  "commands": [...]
}
```

## Install Commands (`InstallCommand`)

Individual commands within a step:

```typescript
{
  // Command execution
  "cmd": "hostnamectl set-hostname {{hostname}}",
  "description": "Set system hostname",
  "safe": true,                    // Allow actual execution
  "sensitive": false,              // Redact from logs if true
  "expectedExitCode": 0,
  "timeout": 30000,                // Milliseconds
  "captureAs": "result_var",      // Store output as variable
  "defaultValue": "fallback",     // Default if capture fails
  "condition": "enableFeature",   // JS expression

  // For prompt-type commands
  "type": "command" | "prompt" | "display",
  "promptType": "input" | "password" | "confirm" | "select" | "multiselect",
  "message": "Enter value:",
  "options": [{ "value": "a", "label": "Option A" }],
  "default": "default_value",
  "validation": "^.+$",
  "allowEmpty": false,
  "required": true,

  // For display-type commands
  "title": "Important Notice",
  "content": ["Line 1", "Line 2"]
}
```

### Command Types

| Type | Behavior |
|------|----------|
| `command` | Executes a shell command |
| `prompt` | Shows an interactive prompt to the user |
| `display` | Shows information (no execution) |

## Post-Install Commands (`PostInstallCommand`)

Commands available after installation completes:

```typescript
{
  "name": "Open Documentation",
  "command": "xdg-open https://docs.example.com",
  "safe": true
}
```

## Variable Substitution

Variables from `configFields` user input are available throughout:

```
{{hostname}}     → Value from config field with id "hostname"
{{installPath}}  → Value from config field with id "installPath"
```

Substitution happens at execution time in both `runCommand` and `runInstallation`.

## Config File Priority

When loading, the installer checks:
1. `installer-config-advanced.json` → used if exists
2. `installer-config.json` → fallback

## Related Pages

- [[Installer System]] - How config drives the installation
- [[VM Config Schema]] - Similar config for VMs
- [[Security Model]] - Command safety filtering
