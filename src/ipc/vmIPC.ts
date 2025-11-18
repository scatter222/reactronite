import { ipcMain, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Client as SSHClient } from 'ssh2';
import type {
  VMConfig,
  VMConfigFile,
  VMState,
  VMOperationResult,
  VMBatchResult,
  FileTransfer,
  PostBootCommand,
  WaitCondition
} from '../app/types/vm-config';

const execAsync = promisify(exec);

export function registerVMHandlers(mainWindow: BrowserWindow) {
  let vmConfig: VMConfigFile | null = null;
  let vmStates: Map<string, VMState> = new Map();

  // Load VM configuration
  ipcMain.handle('vm:getConfig', async () => {
    try {
      const configPath = path.join(process.cwd(), 'vm-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      vmConfig = JSON.parse(configData);
      return vmConfig;
    } catch (error) {
      console.error('Failed to load VM config:', error);
      // Return a default empty config if file doesn't exist
      return {
        version: '1.0',
        vms: [],
        defaults: {},
        variables: {}
      };
    }
  });

  // Save VM configuration
  ipcMain.handle('vm:saveConfig', async (_, config: VMConfigFile) => {
    try {
      const configPath = path.join(process.cwd(), 'vm-config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      vmConfig = config;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get all VM states
  ipcMain.handle('vm:getStates', async () => {
    try {
      const { stdout } = await execAsync('virsh list --all --name');
      const vmNames = stdout.trim().split('\n').filter(name => name);

      const states: VMState[] = [];
      for (const name of vmNames) {
        const state = await getVMState(name);
        states.push(state);
        vmStates.set(name, state);
      }

      return states;
    } catch (error) {
      console.error('Failed to get VM states:', error);
      return [];
    }
  });

  // Get single VM state
  ipcMain.handle('vm:getState', async (_, vmName: string) => {
    try {
      const state = await getVMState(vmName);
      vmStates.set(vmName, state);
      return state;
    } catch (error) {
      return {
        name: vmName,
        state: 'undefined',
        lastError: error.message
      };
    }
  });

  // Create VM from XML definition
  ipcMain.handle('vm:create', async (_, vm: VMConfig) => {
    try {
      // Process domain XML with any variable substitutions
      let xmlContent = await fs.readFile(vm.domainXmlPath, 'utf-8');

      // Apply any global variables
      if (vmConfig?.variables) {
        for (const [key, value] of Object.entries(vmConfig.variables)) {
          xmlContent = xmlContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      // Apply VM-specific variables
      if (vm.variables) {
        for (const [key, value] of Object.entries(vm.variables)) {
          xmlContent = xmlContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      // Run pre-create hooks
      if (vm.hooks?.beforeCreate) {
        for (const cmd of vm.hooks.beforeCreate) {
          await execAsync(cmd);
        }
      }

      // Create temporary XML file
      const tmpXmlPath = path.join('/tmp', `${vm.name}-domain.xml`);
      await fs.writeFile(tmpXmlPath, xmlContent);

      // Define the VM in libvirt
      const { stdout, stderr } = await execAsync(`virsh define ${tmpXmlPath}`);

      // Clean up temp file
      await fs.unlink(tmpXmlPath).catch(() => {});

      // Set autostart if configured
      if (vm.autoStart) {
        await execAsync(`virsh autostart ${vm.name}`);
      }

      // Run post-create hooks
      if (vm.hooks?.afterCreate) {
        for (const cmd of vm.hooks.afterCreate) {
          await execAsync(cmd);
        }
      }

      return {
        success: true,
        vmName: vm.name,
        operation: 'create',
        output: stdout || stderr,
        timestamp: new Date()
      } as VMOperationResult;
    } catch (error) {
      return {
        success: false,
        vmName: vm.name,
        operation: 'create',
        error: error.message,
        timestamp: new Date()
      } as VMOperationResult;
    }
  });

  // Start VM
  ipcMain.handle('vm:start', async (_, vmName: string) => {
    try {
      const vm = vmConfig?.vms.find(v => v.name === vmName);

      // Check dependencies
      if (vm?.depends_on) {
        for (const dep of vm.depends_on) {
          const depState = await getVMState(dep);
          if (depState.state !== 'running') {
            // Recursively start dependency
            await startVM(dep);
          }
        }
      }

      // Run pre-start hooks
      if (vm?.hooks?.beforeStart) {
        for (const cmd of vm.hooks.beforeStart) {
          await execAsync(cmd);
        }
      }

      const result = await startVM(vmName);

      // Run post-start hooks
      if (vm?.hooks?.afterStart) {
        for (const cmd of vm.hooks.afterStart) {
          await execAsync(cmd);
        }
      }

      // Handle post-boot configuration
      if (vm?.postBoot) {
        // Send notification that post-boot is starting
        mainWindow.webContents.send('vm:postBootStart', { vmName });

        // Wait for VM to be ready
        if (vm.postBoot.waitFor) {
          await waitForConditions(vm, vm.postBoot.waitFor);
        }

        // Transfer files
        if (vm.postBoot.files) {
          await transferFiles(vm, vm.postBoot.files);
        }

        // Run commands
        if (vm.postBoot.commands) {
          await runPostBootCommands(vm, vm.postBoot.commands);
        }

        mainWindow.webContents.send('vm:postBootComplete', { vmName });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        vmName,
        operation: 'start',
        error: error.message,
        timestamp: new Date()
      } as VMOperationResult;
    }
  });

  // Stop VM
  ipcMain.handle('vm:stop', async (_, vmName: string, force: boolean = false) => {
    try {
      const vm = vmConfig?.vms.find(v => v.name === vmName);

      // Run pre-stop hooks
      if (vm?.hooks?.beforeStop) {
        for (const cmd of vm.hooks.beforeStop) {
          await execAsync(cmd);
        }
      }

      const command = force ? `virsh destroy ${vmName}` : `virsh shutdown ${vmName}`;
      const { stdout, stderr } = await execAsync(command);

      // Run post-stop hooks
      if (vm?.hooks?.afterStop) {
        for (const cmd of vm.hooks.afterStop) {
          await execAsync(cmd);
        }
      }

      return {
        success: true,
        vmName,
        operation: force ? 'force-stop' : 'stop',
        output: stdout || stderr,
        timestamp: new Date()
      } as VMOperationResult;
    } catch (error) {
      return {
        success: false,
        vmName,
        operation: 'stop',
        error: error.message,
        timestamp: new Date()
      } as VMOperationResult;
    }
  });

  // Delete VM
  ipcMain.handle('vm:delete', async (_, vmName: string) => {
    try {
      // Stop VM if running
      const state = await getVMState(vmName);
      if (state.state === 'running') {
        await execAsync(`virsh destroy ${vmName}`);
      }

      // Undefine the VM
      const { stdout, stderr } = await execAsync(`virsh undefine ${vmName} --remove-all-storage --snapshots-metadata`);

      return {
        success: true,
        vmName,
        operation: 'delete',
        output: stdout || stderr,
        timestamp: new Date()
      } as VMOperationResult;
    } catch (error) {
      return {
        success: false,
        vmName,
        operation: 'delete',
        error: error.message,
        timestamp: new Date()
      } as VMOperationResult;
    }
  });

  // Batch operations
  ipcMain.handle('vm:batchStart', async (_, vmNames: string[], parallel: boolean = false) => {
    const startTime = Date.now();
    const results: VMOperationResult[] = [];

    if (parallel) {
      const promises = vmNames.map(name => startVM(name));
      const batchResults = await Promise.allSettled(promises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            vmName: vmNames[index],
            operation: 'start',
            error: result.reason,
            timestamp: new Date()
          });
        }
      });
    } else {
      for (const vmName of vmNames) {
        const result = await startVM(vmName);
        results.push(result);
      }
    }

    const successful = results.filter(r => r.success).length;
    return {
      totalVMs: vmNames.length,
      successful,
      failed: vmNames.length - successful,
      results,
      duration: Date.now() - startTime
    } as VMBatchResult;
  });

  // Install VMs based on profile
  ipcMain.handle('vm:installProfile', async (_, profileName: string) => {
    if (!vmConfig?.profiles?.[profileName]) {
      throw new Error(`Profile ${profileName} not found`);
    }

    const profile = vmConfig.profiles[profileName];
    const vmNames = profile.vms;
    const results: VMOperationResult[] = [];

    // Sort VMs by priority if specified
    const vms = vmNames
      .map(name => vmConfig.vms.find(v => v.name === name))
      .filter(vm => vm)
      .sort((a, b) => (a?.priority || 999) - (b?.priority || 999));

    for (const vm of vms) {
      if (!vm) continue;

      // Create VM
      mainWindow.webContents.send('vm:installProgress', {
        vmName: vm.name,
        status: 'creating',
        message: `Creating VM ${vm.name}...`
      });

      const createResult = await createVM(vm);
      results.push(createResult);

      if (!createResult.success) {
        mainWindow.webContents.send('vm:installProgress', {
          vmName: vm.name,
          status: 'error',
          message: `Failed to create VM: ${createResult.error}`
        });
        continue;
      }

      // Start VM
      mainWindow.webContents.send('vm:installProgress', {
        vmName: vm.name,
        status: 'starting',
        message: `Starting VM ${vm.name}...`
      });

      const startResult = await startVM(vm.name);
      results.push(startResult);

      if (!startResult.success) {
        mainWindow.webContents.send('vm:installProgress', {
          vmName: vm.name,
          status: 'error',
          message: `Failed to start VM: ${startResult.error}`
        });
        continue;
      }

      mainWindow.webContents.send('vm:installProgress', {
        vmName: vm.name,
        status: 'complete',
        message: `VM ${vm.name} installed successfully`
      });

      // Add delay if specified
      if (vm.autoStartDelay) {
        await new Promise(resolve => setTimeout(resolve, vm.autoStartDelay * 1000));
      }
    }

    const successful = results.filter(r => r.success).length;
    return {
      totalVMs: vms.length * 2, // Create + start for each VM
      successful,
      failed: results.length - successful,
      results,
      duration: 0
    } as VMBatchResult;
  });

  // Execute command on VM via SSH
  ipcMain.handle('vm:executeCommand', async (_, vmName: string, command: PostBootCommand) => {
    const vm = vmConfig?.vms.find(v => v.name === vmName);
    if (!vm?.postBoot?.ssh) {
      throw new Error(`SSH configuration not found for VM ${vmName}`);
    }

    return new Promise((resolve) => {
      const conn = new SSHClient();

      conn.on('ready', () => {
        let output = '';
        let errorOutput = '';

        const execCommand = command.env
          ? `export ${Object.entries(command.env).map(([k, v]) => `${k}="${v}"`).join(' ')} && ${command.cmd}`
          : command.cmd;

        conn.exec(execCommand, (err, stream) => {
          if (err) {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'execute-command',
              error: err.message,
              timestamp: new Date()
            });
            return;
          }

          stream.on('close', (code: number) => {
            conn.end();

            const expectedCode = command.expectedExitCode ?? 0;
            const success = command.ignoreError || code === expectedCode;

            resolve({
              success,
              vmName,
              operation: 'execute-command',
              output: output + errorOutput,
              error: success ? undefined : `Exit code ${code}`,
              timestamp: new Date()
            });
          });

          stream.on('data', (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;

            if (!command.sensitive) {
              mainWindow.webContents.send('vm:commandOutput', {
                vmName,
                type: 'stdout',
                data: chunk
              });
            }
          });

          stream.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            errorOutput += chunk;

            if (!command.sensitive) {
              mainWindow.webContents.send('vm:commandOutput', {
                vmName,
                type: 'stderr',
                data: chunk
              });
            }
          });
        });
      });

      conn.on('error', (err) => {
        resolve({
          success: false,
          vmName,
          operation: 'execute-command',
          error: err.message,
          timestamp: new Date()
        });
      });

      // Get VM IP address
      getVMIPAddress(vmName).then(ip => {
        if (!ip) {
          resolve({
            success: false,
            vmName,
            operation: 'execute-command',
            error: 'Could not determine VM IP address',
            timestamp: new Date()
          });
          return;
        }

        const sshConfig = vm.postBoot!.ssh!;

        // Connect via SSH
        if (sshConfig.keyPath) {
          fs.readFile(sshConfig.keyPath).then(privateKey => {
            conn.connect({
              host: ip,
              port: sshConfig.port || 22,
              username: sshConfig.user || 'root',
              privateKey
            });
          }).catch(err => {
            resolve({
              success: false,
              vmName,
              operation: 'execute-command',
              error: `Failed to read SSH key: ${err.message}`,
              timestamp: new Date()
            });
          });
        } else {
          conn.connect({
            host: ip,
            port: sshConfig.port || 22,
            username: sshConfig.user || 'root',
            password: sshConfig.password
          });
        }
      });
    });
  });

  // Transfer file to VM
  ipcMain.handle('vm:transferFile', async (_, vmName: string, transfer: FileTransfer) => {
    const vm = vmConfig?.vms.find(v => v.name === vmName);
    if (!vm?.postBoot?.ssh) {
      throw new Error(`SSH configuration not found for VM ${vmName}`);
    }

    return new Promise((resolve) => {
      const conn = new SSHClient();

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: err.message,
              timestamp: new Date()
            });
            return;
          }

          // Read source file
          fs.readFile(transfer.source).then(async (data) => {
            let content = data.toString();

            // Process template if needed
            if (transfer.template && transfer.variables) {
              for (const [key, value] of Object.entries(transfer.variables)) {
                content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
              }
            }

            // Write to destination
            sftp.writeFile(transfer.destination, content, (err) => {
              if (err) {
                conn.end();
                resolve({
                  success: false,
                  vmName,
                  operation: 'transfer-file',
                  error: err.message,
                  timestamp: new Date()
                });
                return;
              }

              // Set permissions if specified
              if (transfer.permissions) {
                const mode = parseInt(transfer.permissions, 8);
                sftp.chmod(transfer.destination, mode, (err) => {
                  conn.end();

                  resolve({
                    success: !err,
                    vmName,
                    operation: 'transfer-file',
                    output: `Transferred ${transfer.source} to ${transfer.destination}`,
                    error: err?.message,
                    timestamp: new Date()
                  });
                });
              } else {
                conn.end();
                resolve({
                  success: true,
                  vmName,
                  operation: 'transfer-file',
                  output: `Transferred ${transfer.source} to ${transfer.destination}`,
                  timestamp: new Date()
                });
              }
            });
          }).catch(err => {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: `Failed to read source file: ${err.message}`,
              timestamp: new Date()
            });
          });
        });
      });

      conn.on('error', (err) => {
        resolve({
          success: false,
          vmName,
          operation: 'transfer-file',
          error: err.message,
          timestamp: new Date()
        });
      });

      // Get VM IP and connect
      getVMIPAddress(vmName).then(ip => {
        if (!ip) {
          resolve({
            success: false,
            vmName,
            operation: 'transfer-file',
            error: 'Could not determine VM IP address',
            timestamp: new Date()
          });
          return;
        }

        const sshConfig = vm.postBoot!.ssh!;

        if (sshConfig.keyPath) {
          fs.readFile(sshConfig.keyPath).then(privateKey => {
            conn.connect({
              host: ip,
              port: sshConfig.port || 22,
              username: sshConfig.user || 'root',
              privateKey
            });
          }).catch(err => {
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: `Failed to read SSH key: ${err.message}`,
              timestamp: new Date()
            });
          });
        } else {
          conn.connect({
            host: ip,
            port: sshConfig.port || 22,
            username: sshConfig.user || 'root',
            password: sshConfig.password
          });
        }
      });
    });
  });

  // Helper functions
  async function createVM(vm: VMConfig): Promise<VMOperationResult> {
    try {
      // Process domain XML with any variable substitutions
      let xmlContent = await fs.readFile(vm.domainXmlPath, 'utf-8');

      // Apply any global variables
      if (vmConfig?.variables) {
        for (const [key, value] of Object.entries(vmConfig.variables)) {
          xmlContent = xmlContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      // Apply VM-specific variables
      if (vm.variables) {
        for (const [key, value] of Object.entries(vm.variables)) {
          xmlContent = xmlContent.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
      }

      // Run pre-create hooks
      if (vm.hooks?.beforeCreate) {
        for (const cmd of vm.hooks.beforeCreate) {
          await execAsync(cmd);
        }
      }

      // Create temporary XML file
      const tmpXmlPath = path.join('/tmp', `${vm.name}-domain.xml`);
      await fs.writeFile(tmpXmlPath, xmlContent);

      // Define the VM in libvirt
      const { stdout, stderr } = await execAsync(`virsh define ${tmpXmlPath}`);

      // Clean up temp file
      await fs.unlink(tmpXmlPath).catch(() => {});

      // Set autostart if configured
      if (vm.autoStart) {
        await execAsync(`virsh autostart ${vm.name}`);
      }

      // Run post-create hooks
      if (vm.hooks?.afterCreate) {
        for (const cmd of vm.hooks.afterCreate) {
          await execAsync(cmd);
        }
      }

      return {
        success: true,
        vmName: vm.name,
        operation: 'create',
        output: stdout || stderr,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        vmName: vm.name,
        operation: 'create',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async function getVMState(vmName: string): Promise<VMState> {
    try {
      const { stdout: stateOutput } = await execAsync(`virsh domstate ${vmName}`);
      const state = stateOutput.trim().toLowerCase();

      // Get additional info if VM is running
      let ipAddress: string | undefined;
      let macAddress: string | undefined;

      if (state === 'running') {
        ipAddress = await getVMIPAddress(vmName);
        macAddress = await getVMMACAddress(vmName);
      }

      return {
        name: vmName,
        state: state as VMState['state'],
        ipAddress,
        macAddress
      };
    } catch (error) {
      return {
        name: vmName,
        state: 'undefined',
        lastError: error.message
      };
    }
  }

  async function getVMIPAddress(vmName: string): Promise<string | undefined> {
    try {
      // Try to get IP from libvirt
      const { stdout } = await execAsync(`virsh domifaddr ${vmName}`);
      const match = stdout.match(/\d+\.\d+\.\d+\.\d+/);
      return match ? match[0] : undefined;
    } catch {
      return undefined;
    }
  }

  async function getVMMACAddress(vmName: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`virsh domiflist ${vmName}`);
      const match = stdout.match(/([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}/);
      return match ? match[0] : undefined;
    } catch {
      return undefined;
    }
  }

  async function startVM(vmName: string): Promise<VMOperationResult> {
    try {
      const { stdout, stderr } = await execAsync(`virsh start ${vmName}`);
      return {
        success: true,
        vmName,
        operation: 'start',
        output: stdout || stderr,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        vmName,
        operation: 'start',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async function executeVMCommand(vmName: string, command: PostBootCommand): Promise<VMOperationResult> {
    const vm = vmConfig?.vms.find(v => v.name === vmName);
    if (!vm?.postBoot?.ssh) {
      return {
        success: false,
        vmName,
        operation: 'execute-command',
        error: `SSH configuration not found for VM ${vmName}`,
        timestamp: new Date()
      };
    }

    return new Promise((resolve) => {
      const conn = new SSHClient();

      conn.on('ready', () => {
        let output = '';
        let errorOutput = '';

        const execCommand = command.env
          ? `export ${Object.entries(command.env).map(([k, v]) => `${k}="${v}"`).join(' ')} && ${command.cmd}`
          : command.cmd;

        conn.exec(execCommand, (err, stream) => {
          if (err) {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'execute-command',
              error: err.message,
              timestamp: new Date()
            });
            return;
          }

          stream.on('close', (code: number) => {
            conn.end();

            const expectedCode = command.expectedExitCode ?? 0;
            const success = command.ignoreError || code === expectedCode;

            resolve({
              success,
              vmName,
              operation: 'execute-command',
              output: output + errorOutput,
              error: success ? undefined : `Exit code ${code}`,
              timestamp: new Date()
            });
          });

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        resolve({
          success: false,
          vmName,
          operation: 'execute-command',
          error: err.message,
          timestamp: new Date()
        });
      });

      // Get VM IP and connect
      getVMIPAddress(vmName).then(ip => {
        if (!ip) {
          resolve({
            success: false,
            vmName,
            operation: 'execute-command',
            error: 'Could not determine VM IP address',
            timestamp: new Date()
          });
          return;
        }

        const sshConfig = vm.postBoot!.ssh!;

        if (sshConfig.keyPath) {
          fs.readFile(sshConfig.keyPath).then(privateKey => {
            conn.connect({
              host: ip,
              port: sshConfig.port || 22,
              username: sshConfig.user || 'root',
              privateKey
            });
          }).catch(err => {
            resolve({
              success: false,
              vmName,
              operation: 'execute-command',
              error: `Failed to read SSH key: ${err.message}`,
              timestamp: new Date()
            });
          });
        } else {
          conn.connect({
            host: ip,
            port: sshConfig.port || 22,
            username: sshConfig.user || 'root',
            password: sshConfig.password
          });
        }
      });
    });
  }

  async function transferFileToVM(vmName: string, transfer: FileTransfer): Promise<VMOperationResult> {
    const vm = vmConfig?.vms.find(v => v.name === vmName);
    if (!vm?.postBoot?.ssh) {
      return {
        success: false,
        vmName,
        operation: 'transfer-file',
        error: `SSH configuration not found for VM ${vmName}`,
        timestamp: new Date()
      };
    }

    return new Promise((resolve) => {
      const conn = new SSHClient();

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: err.message,
              timestamp: new Date()
            });
            return;
          }

          // Read source file
          fs.readFile(transfer.source).then(async (data) => {
            let content = data.toString();

            // Process template if needed
            if (transfer.template && transfer.variables) {
              for (const [key, value] of Object.entries(transfer.variables)) {
                content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
              }
            }

            // Write to destination
            sftp.writeFile(transfer.destination, content, (writeErr) => {
              if (writeErr) {
                conn.end();
                resolve({
                  success: false,
                  vmName,
                  operation: 'transfer-file',
                  error: writeErr.message,
                  timestamp: new Date()
                });
                return;
              }

              // Set permissions if specified
              if (transfer.permissions) {
                const mode = parseInt(transfer.permissions, 8);
                sftp.chmod(transfer.destination, mode, (chmodErr) => {
                  conn.end();

                  resolve({
                    success: !chmodErr,
                    vmName,
                    operation: 'transfer-file',
                    output: `Transferred ${transfer.source} to ${transfer.destination}`,
                    error: chmodErr?.message,
                    timestamp: new Date()
                  });
                });
              } else {
                conn.end();
                resolve({
                  success: true,
                  vmName,
                  operation: 'transfer-file',
                  output: `Transferred ${transfer.source} to ${transfer.destination}`,
                  timestamp: new Date()
                });
              }
            });
          }).catch(err => {
            conn.end();
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: `Failed to read source file: ${err.message}`,
              timestamp: new Date()
            });
          });
        });
      });

      conn.on('error', (err) => {
        resolve({
          success: false,
          vmName,
          operation: 'transfer-file',
          error: err.message,
          timestamp: new Date()
        });
      });

      // Get VM IP and connect
      getVMIPAddress(vmName).then(ip => {
        if (!ip) {
          resolve({
            success: false,
            vmName,
            operation: 'transfer-file',
            error: 'Could not determine VM IP address',
            timestamp: new Date()
          });
          return;
        }

        const sshConfig = vm.postBoot!.ssh!;

        if (sshConfig.keyPath) {
          fs.readFile(sshConfig.keyPath).then(privateKey => {
            conn.connect({
              host: ip,
              port: sshConfig.port || 22,
              username: sshConfig.user || 'root',
              privateKey
            });
          }).catch(err => {
            resolve({
              success: false,
              vmName,
              operation: 'transfer-file',
              error: `Failed to read SSH key: ${err.message}`,
              timestamp: new Date()
            });
          });
        } else {
          conn.connect({
            host: ip,
            port: sshConfig.port || 22,
            username: sshConfig.user || 'root',
            password: sshConfig.password
          });
        }
      });
    });
  }

  async function waitForConditions(vm: VMConfig, conditions: WaitCondition[]): Promise<void> {
    for (const condition of conditions) {
      const timeout = condition.timeout || 60;
      const retryInterval = condition.retryInterval || 2;
      const startTime = Date.now();

      mainWindow.webContents.send('vm:waitCondition', {
        vmName: vm.name,
        condition: condition.type,
        status: 'waiting'
      });

      while (Date.now() - startTime < timeout * 1000) {
        let ready = false;

        switch (condition.type) {
          case 'port':
            const ip = await getVMIPAddress(vm.name);
            if (ip && condition.target) {
              try {
                await execAsync(`nc -zv ${ip} ${condition.target}`, { timeout: 2000 });
                ready = true;
              } catch {
                // Port not ready yet
              }
            }
            break;

          case 'http':
          case 'https':
            if (condition.target) {
              try {
                const { stdout } = await execAsync(`curl -sf -o /dev/null -w "%{http_code}" ${condition.target}`, { timeout: 5000 });
                if (condition.expectedResponse) {
                  ready = stdout === condition.expectedResponse;
                } else {
                  ready = stdout.startsWith('2') || stdout === '301' || stdout === '302';
                }
              } catch {
                // Not ready yet
              }
            }
            break;

          case 'command':
            if (condition.command) {
              try {
                await execAsync(condition.command, { timeout: 5000 });
                ready = true;
              } catch {
                // Command failed, not ready
              }
            }
            break;

          case 'file':
            const fileCheckIp = await getVMIPAddress(vm.name);
            if (fileCheckIp && condition.target && vm.postBoot?.ssh) {
              // Check file existence via SSH
              const checkResult = await executeVMCommand(vm.name, {
                cmd: `test -e ${condition.target}`,
                description: `Check for file ${condition.target}`,
                ignoreError: true
              });
              ready = checkResult.success;
            }
            break;
        }

        if (ready) {
          mainWindow.webContents.send('vm:waitCondition', {
            vmName: vm.name,
            condition: condition.type,
            status: 'ready'
          });
          break;
        }

        await new Promise(resolve => setTimeout(resolve, retryInterval * 1000));
      }
    }
  }

  async function transferFiles(vm: VMConfig, files: FileTransfer[]): Promise<void> {
    for (const file of files) {
      mainWindow.webContents.send('vm:fileTransfer', {
        vmName: vm.name,
        file: file.destination,
        status: 'transferring'
      });

      const result = await transferFileToVM(vm.name, file);

      mainWindow.webContents.send('vm:fileTransfer', {
        vmName: vm.name,
        file: file.destination,
        status: result.success ? 'complete' : 'error',
        error: result.error
      });
    }
  }

  async function runPostBootCommands(vm: VMConfig, commands: PostBootCommand[]): Promise<void> {
    for (const command of commands) {
      // Check condition if specified
      if (command.condition) {
        try {
          const conditionMet = eval(command.condition);
          if (!conditionMet) continue;
        } catch {
          continue;
        }
      }

      mainWindow.webContents.send('vm:commandStart', {
        vmName: vm.name,
        command: command.description || command.cmd
      });

      let retries = command.retries || 0;
      let success = false;
      let lastError: string | undefined;

      while (retries >= 0 && !success) {
        const result = await executeVMCommand(vm.name, command);
        success = result.success;
        lastError = result.error;

        if (!success && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, (command.retryDelay || 5) * 1000));
        }
        retries--;
      }

      mainWindow.webContents.send('vm:commandComplete', {
        vmName: vm.name,
        command: command.description || command.cmd,
        success,
        error: lastError
      });

      if (!success && !command.ignoreError) {
        throw new Error(`Command failed: ${command.description || command.cmd} - ${lastError}`);
      }
    }
  }
}