import { ipcMain, BrowserWindow } from 'electron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { InstallerConfig, PreCheck, InstallCommand, UserConfig } from '../app/types/installer-config';

const execAsync = promisify(exec);

export function registerInstallerHandlers(mainWindow: BrowserWindow) {
  let installerConfig: InstallerConfig | null = null;
  let userConfig: UserConfig = {};

  // Load installer configuration
  ipcMain.handle('installer:getConfig', async () => {
    try {
      // Try advanced config first, fall back to basic
      let configPath = path.join(process.cwd(), 'installer-config-advanced.json');
      
      try {
        await fs.access(configPath);
      } catch {
        // Fall back to basic config
        configPath = path.join(process.cwd(), 'installer-config.json');
      }
      
      const configData = await fs.readFile(configPath, 'utf-8');
      installerConfig = JSON.parse(configData);
      return installerConfig;
    } catch (error) {
      console.error('Failed to load installer config:', error);
      throw error;
    }
  });

  // Load advanced installer configuration
  ipcMain.handle('installer:getAdvancedConfig', async () => {
    try {
      const configPath = path.join(process.cwd(), 'installer-config-advanced.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      // Return null if advanced config doesn't exist
      return null;
    }
  });

  // Save user configuration
  ipcMain.handle('installer:saveUserConfig', async (_, config: UserConfig) => {
    userConfig = config;
    return { success: true };
  });

  // Run pre-installation check
  ipcMain.handle('installer:runPreCheck', async (_, check: PreCheck) => {
    try {
      // Allow certain safe commands to run for real
      const safeCommands = [
        'uname', 'hostname', 'whoami', 'pwd', 'date', 'df', 'free',
        'ip route', 'ip addr', 'ls', 'cat /etc/os-release', 'echo'
      ];
      
      // Check if command starts with a safe command
      const isActuallySafe = safeCommands.some(safe => 
        check.command.startsWith(safe + ' ') || 
        check.command === safe ||
        check.command.startsWith('echo ')
      );
      
      // Run the actual command if it's safe, otherwise echo it
      const command = isActuallySafe ? check.command : `echo "Would run: ${check.command}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 10000, // 10 second timeout
      });

      const output = stdout || stderr;

      // Check for expected patterns
      if (check.expectedPattern) {
        const regex = new RegExp(check.expectedPattern, 'i'); // Case insensitive
        if (!regex.test(output)) {
          return {
            success: false,
            output,
            error: `Output doesn't match expected pattern: ${check.expectedPattern}`
          };
        }
      }

      // For disk space checks (simplified)
      if (check.type === 'diskSpace') {
        // This is a simplified check - in production you'd parse df output properly
        return {
          success: true,
          output,
          warning: check.minRequired ? `Ensure at least ${check.minRequired} is available` : undefined
        };
      }

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        error: error.message
      };
    }
  });

  // Execute installation command
  ipcMain.handle('installer:runCommand', async (_, command: InstallCommand, variables: UserConfig) => {
    try {
      // Replace variables in command
      let processedCommand = command.cmd || '';
      for (const [key, value] of Object.entries(variables)) {
        const replacementValue = value !== undefined && value !== null ? String(value) : '';
        processedCommand = processedCommand.replace(new RegExp(`{{${key}}}`, 'g'), replacementValue);
      }

      // List of actually safe commands that can run without explicit safe flag
      const safeCommands = [
        'uname', 'hostname', 'whoami', 'pwd', 'date', 'df', 'free',
        'ip route', 'ip addr', 'ls', 'echo', 'cat /etc/os-release',
        'systemctl list-units', 'which', 'test', 'head', 'tail', 'wc'
      ];
      
      const isInherentlySafe = safeCommands.some(safe => 
        processedCommand.startsWith(safe + ' ') || 
        processedCommand === safe ||
        processedCommand.startsWith('echo ')
      );

      // For safety, only run commands marked as safe or inherently safe commands
      if (!command.safe && !isInherentlySafe) {
        processedCommand = `echo "Would run: ${processedCommand}"`;
      }

      // Don't log sensitive commands
      if (!command.sensitive) {
        console.log('Executing:', processedCommand);
      }

      const { stdout, stderr } = await execAsync(processedCommand, {
        timeout: command.timeout || 30000, // Default 30 second timeout
      });

      return {
        success: true,
        output: stdout || stderr,
        command: command.sensitive ? '[REDACTED]' : processedCommand
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        error: error.message,
        command: command.sensitive ? '[REDACTED]' : command.cmd
      };
    }
  });

  // Stream command execution for real-time output
  ipcMain.handle('installer:streamCommand', async (event, command: InstallCommand, variables: UserConfig) => {
    return new Promise((resolve) => {
      try {
        // Replace variables in command
        let processedCommand = command.cmd || '';
        for (const [key, value] of Object.entries(variables)) {
          const replacementValue = value !== undefined && value !== null ? String(value) : '';
          processedCommand = processedCommand.replace(new RegExp(`{{${key}}}`, 'g'), replacementValue);
        }

        // For safety, only run commands marked as safe or use echo
        if (!command.safe && !processedCommand.startsWith('echo')) {
          processedCommand = `echo "Would run: ${processedCommand}"`;
        }

        // Use spawn for streaming output
        const [cmd, ...args] = processedCommand.split(' ');
        const child = spawn(cmd, args, {
          shell: true,
        });

        let output = '';

        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          
          // Send real-time output to renderer
          mainWindow.webContents.send('installer:commandOutput', {
            type: 'stdout',
            data: chunk,
            command: command.description
          });
        });

        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          
          mainWindow.webContents.send('installer:commandOutput', {
            type: 'stderr',
            data: chunk,
            command: command.description
          });
        });

        child.on('close', (code) => {
          resolve({
            success: code === 0,
            output,
            exitCode: code,
            command: command.sensitive ? '[REDACTED]' : processedCommand
          });
        });

        child.on('error', (error) => {
          resolve({
            success: false,
            output: error.message,
            error: error.message,
            command: command.sensitive ? '[REDACTED]' : processedCommand
          });
        });

        // Set timeout
        setTimeout(() => {
          child.kill();
          resolve({
            success: false,
            output: 'Command timed out',
            error: 'Timeout exceeded',
            command: command.sensitive ? '[REDACTED]' : processedCommand
          });
        }, command.timeout || 30000);

      } catch (error) {
        resolve({
          success: false,
          output: error.message,
          error: error.message,
          command: command.sensitive ? '[REDACTED]' : command.cmd
        });
      }
    });
  });

  // Get installation steps
  ipcMain.handle('installer:getInstallSteps', async () => {
    if (!installerConfig) {
      throw new Error('Installer configuration not loaded');
    }
    
    // Filter steps based on conditions
    const steps = installerConfig.installSteps.filter(step => {
      if (step.condition) {
        // Check if condition is met in userConfig
        return userConfig[step.condition] === true;
      }
      return true;
    });

    return steps;
  });

  // Helper function to get install steps with conditions applied
  const getFilteredInstallSteps = () => {
    if (!installerConfig) {
      throw new Error('Installer configuration not loaded');
    }
    
    // Filter steps based on conditions
    const steps = installerConfig.installSteps.filter(step => {
      if (step.condition) {
        // Check if condition is met in userConfig
        return userConfig[step.condition] === true;
      }
      return true;
    });

    return steps;
  };

  // Execute full installation
  ipcMain.handle('installer:runInstallation', async () => {
    if (!installerConfig) {
      throw new Error('Installer configuration not loaded');
    }

    const results = [];
    const steps = getFilteredInstallSteps();

    for (const step of steps) {
      mainWindow.webContents.send('installer:stepStart', {
        name: step.name,
        description: step.description
      });

      for (const command of step.commands) {
        // Stream command execution with real-time output
        const result: any = await new Promise((resolve) => {
          try {
            // Replace variables in command
            let processedCommand = command.cmd || '';
            for (const [key, value] of Object.entries(userConfig)) {
              const replacementValue = value !== undefined && value !== null ? String(value) : '';
              processedCommand = processedCommand.replace(new RegExp(`{{${key}}}`, 'g'), replacementValue);
            }

            // List of actually safe commands
            const safeCommands = [
              'uname', 'hostname', 'whoami', 'pwd', 'date', 'df', 'free',
              'ip route', 'ip addr', 'ls', 'echo', 'cat /etc/os-release',
              'systemctl list-units', 'which', 'test', 'head', 'tail', 'wc'
            ];
            
            const isInherentlySafe = safeCommands.some(safe => 
              processedCommand.startsWith(safe + ' ') || 
              processedCommand === safe ||
              processedCommand.startsWith('echo ')
            );

            // For safety, only run commands marked as safe or inherently safe commands
            if (!command.safe && !isInherentlySafe) {
              processedCommand = `echo "Would run: ${processedCommand}"`;
            }

            const { exec } = require('child_process');
            const child = exec(processedCommand, {
              timeout: command.timeout || 30000,
            });

            let output = '';

            child.stdout?.on('data', (data: Buffer) => {
              const chunk = data.toString();
              output += chunk;
              
              mainWindow.webContents.send('installer:commandOutput', {
                type: 'stdout',
                data: chunk,
                command: command.description
              });
            });

            child.stderr?.on('data', (data: Buffer) => {
              const chunk = data.toString();
              output += chunk;
              
              mainWindow.webContents.send('installer:commandOutput', {
                type: 'stderr',
                data: chunk,
                command: command.description
              });
            });

            child.on('close', (code: number) => {
              resolve({
                success: code === 0,
                output,
                exitCode: code,
                command: command.sensitive ? '[REDACTED]' : processedCommand
              });
            });

            child.on('error', (error: Error) => {
              resolve({
                success: false,
                output: error.message,
                error: error.message,
                exitCode: -1,
                command: command.sensitive ? '[REDACTED]' : processedCommand
              });
            });

          } catch (error: any) {
            resolve({
              success: false,
              output: error.message,
              error: error.message,
              exitCode: -1,
              command: command.sensitive ? '[REDACTED]' : command.cmd
            });
          }
        });

        results.push({
          step: step.name,
          command: command.description,
          ...result
        });

        if (!result.success && command.expectedExitCode !== undefined) {
          // Check if the exit code matches expected
          if (result.exitCode !== command.expectedExitCode) {
            mainWindow.webContents.send('installer:stepError', {
              step: step.name,
              error: result.error || 'Command failed'
            });
            break;
          }
        }
      }

      mainWindow.webContents.send('installer:stepComplete', {
        name: step.name
      });
    }

    return results;
  });
}