import { ipcMain, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
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
  const vmStates: Map<string, VMState> = new Map();
  // Track VMs where we've already fixed the guest agent to avoid repeated attempts
  const agentFixedVMs: Set<string> = new Set();

  // Helper: Apply variable substitution to a string
  function applyVariables(content: string, variables: Record<string, any>): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  }

  // Helper: Get VM state from virsh
  async function getVMState(vmName: string): Promise<VMState> {
    try {
      const { stdout } = await execAsync(`virsh domstate ${vmName}`);
      const state = stdout.trim().toLowerCase();

      let ipAddress: string | undefined;
      let macAddress: string | undefined;

      if (state === 'running') {
        try {
          const { stdout: ipOut } = await execAsync(`virsh domifaddr ${vmName}`);
          const ipMatch = ipOut.match(/\d+\.\d+\.\d+\.\d+/);
          ipAddress = ipMatch?.[0];

          const { stdout: macOut } = await execAsync(`virsh domiflist ${vmName}`);
          const macMatch = macOut.match(/([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}/);
          macAddress = macMatch?.[0];
        } catch { /* ignore */ }
      }

      return { name: vmName, state: state as VMState['state'], ipAddress, macAddress };
    } catch (error: any) {
      return { name: vmName, state: 'undefined', lastError: error.message };
    }
  }

  // Helper: Check if guest agent is available
  async function isAgentReady(vmName: string): Promise<boolean> {
    try {
      await execAsync(`virsh qemu-agent-command ${vmName} '{"execute":"guest-ping"}'`);
      return true;
    } catch {
      return false;
    }
  }

  // Helper: Build SSH command string for a VM
  function buildSSHCommand(vm: VMConfig, ip: string, remoteCmd: string): string {
    const port = vm.ssh?.port || 22;
    const user = vm.ssh?.username || 'root';
    const sshOpts = '-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR';

    if (vm.ssh?.keyPath) {
      return `ssh ${sshOpts} -p ${port} -i ${vm.ssh.keyPath} ${user}@${ip} ${JSON.stringify(remoteCmd)}`;
    } else if (vm.ssh?.password) {
      return `sshpass -p ${JSON.stringify(vm.ssh.password)} ssh ${sshOpts} -p ${port} ${user}@${ip} ${JSON.stringify(remoteCmd)}`;
    }
    throw new Error(`No SSH credentials configured for ${vm.name}`);
  }

  // Helper: Execute a command on a VM via SSH
  async function sshExec(vm: VMConfig, remoteCmd: string): Promise<{ stdout: string; stderr: string }> {
    const state = await getVMState(vm.name);
    if (!state.ipAddress) {
      throw new Error(`Cannot SSH to ${vm.name}: no IP address available`);
    }
    const cmd = buildSSHCommand(vm, state.ipAddress, remoteCmd);
    return execAsync(cmd, { timeout: 30000 });
  }

  // Helper: Fix guest agent RPC restrictions via SSH
  async function fixGuestAgentViaSSH(vm: VMConfig): Promise<boolean> {
    if (!vm.ssh) return false;
    if (agentFixedVMs.has(vm.name)) return false; // Already tried

    try {
      mainWindow.webContents.send('vm:commandOutput', {
        vmName: vm.name,
        type: 'stderr',
        data: 'guest-exec is disabled — attempting SSH fix of guest agent config...'
      });

      // Clear restrictive RPC filtering and restart the agent
      await sshExec(vm, `sed -i 's/^FILTER_RPC_ARGS=.*/FILTER_RPC_ARGS=""/' /etc/sysconfig/qemu-ga && systemctl restart qemu-guest-agent`);

      agentFixedVMs.add(vm.name);

      // Wait for the agent to come back up after restart
      const start = Date.now();
      while (Date.now() - start < 15000) {
        if (await isAgentReady(vm.name)) {
          mainWindow.webContents.send('vm:commandOutput', {
            vmName: vm.name,
            type: 'stdout',
            data: 'Guest agent fixed and restarted successfully'
          });
          return true;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      mainWindow.webContents.send('vm:commandOutput', {
        vmName: vm.name,
        type: 'stderr',
        data: 'Guest agent did not come back after restart'
      });
      return false;
    } catch (error: any) {
      mainWindow.webContents.send('vm:commandOutput', {
        vmName: vm.name,
        type: 'stderr',
        data: `SSH fix failed: ${error.message}`
      });
      return false;
    }
  }

  // Helper: Execute command via guest agent
  async function guestExec(vmName: string, command: PostBootCommand): Promise<VMOperationResult> {
    try {
      // Base64-encode the command to completely avoid shell quoting issues.
      // This means nested quotes, special chars, etc. all pass through cleanly.
      // The guest-exec JSON uses the b64 string (safe chars only: A-Za-z0-9+/=),
      // and bash decodes + executes it inside the VM.
      const cmdB64 = Buffer.from(command.cmd).toString('base64');

      let shellCmd: string;
      if (command.user) {
        // su - <user> gives a full login shell (sources /etc/profile, ~/.bash_profile, etc.)
        // The $() substitution decodes the command, su passes it to bash via -c
        shellCmd = `su - ${command.user} -c "$(echo ${cmdB64} | base64 -d)"`;
      } else {
        shellCmd = `eval "$(echo ${cmdB64} | base64 -d)"`;
      }

      const args = ['-l', '-c', shellCmd];
      const execPayload = {
        execute: 'guest-exec',
        arguments: {
          path: '/bin/bash',
          arg: args,
          'capture-output': true
        }
      };

      // The JSON payload is safe to single-quote on the shell because:
      // - JSON keys/values use double quotes (no conflict with outer single quotes)
      // - The command is base64-encoded (only A-Za-z0-9+/= chars, no quotes)
      const { stdout: execResult } = await execAsync(
        `virsh qemu-agent-command ${vmName} '${JSON.stringify(execPayload)}'`
      );

      const { return: execReturn } = JSON.parse(execResult);
      const pid = execReturn.pid;

      // Poll for completion
      const timeout = (command.timeout || 60) * 1000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const statusPayload = { execute: 'guest-exec-status', arguments: { pid } };
        const { stdout: statusResult } = await execAsync(
          `virsh qemu-agent-command ${vmName} '${JSON.stringify(statusPayload)}'`
        );

        const { return: status } = JSON.parse(statusResult);

        if (status.exited) {
          const stdout = status['out-data'] ? Buffer.from(status['out-data'], 'base64').toString() : '';
          const stderr = status['err-data'] ? Buffer.from(status['err-data'], 'base64').toString() : '';
          const exitCode = status.exitcode;
          const expectedCode = command.expectedExitCode ?? 0;
          const success = command.ignoreError || exitCode === expectedCode;

          if (!command.sensitive) {
            if (stdout) mainWindow.webContents.send('vm:commandOutput', { vmName, type: 'stdout', data: stdout });
            if (stderr) mainWindow.webContents.send('vm:commandOutput', { vmName, type: 'stderr', data: stderr });
          }

          return {
            success,
            vmName,
            operation: 'execute-command',
            output: stdout + stderr,
            error: success ? undefined : `Exit code ${exitCode}`,
            timestamp: new Date()
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      return {
        success: false,
        vmName,
        operation: 'execute-command',
        error: 'Command timed out',
        timestamp: new Date()
      };
    } catch (error: any) {
      // Detect guest-exec disabled and attempt SSH fix
      if (error.message?.includes('the command is not allowed') || error.message?.includes('has been disabled')) {
        const vm = vmConfig?.vms.find(v => v.name === vmName);
        if (vm?.ssh && !agentFixedVMs.has(vmName)) {
          const fixed = await fixGuestAgentViaSSH(vm);
          if (fixed) {
            // Retry the command after fixing
            return guestExec(vmName, command);
          }
        }
      }

      return {
        success: false,
        vmName,
        operation: 'execute-command',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Helper: Transfer file via guest agent
  async function guestFileWrite(vmName: string, transfer: FileTransfer): Promise<VMOperationResult> {
    try {
      // Read and process source file
      let content = await fs.readFile(transfer.source, 'utf-8');

      if (transfer.template && transfer.variables) {
        content = applyVariables(content, transfer.variables);
      }

      const contentBase64 = Buffer.from(content).toString('base64');

      // Open file for writing
      const openPayload = {
        execute: 'guest-file-open',
        arguments: { path: transfer.destination, mode: 'w' }
      };

      const { stdout: openResult } = await execAsync(
        `virsh qemu-agent-command ${vmName} '${JSON.stringify(openPayload)}'`
      );
      const handle = JSON.parse(openResult).return;

      // Write content
      const writePayload = {
        execute: 'guest-file-write',
        arguments: { handle, 'buf-b64': contentBase64 }
      };

      await execAsync(`virsh qemu-agent-command ${vmName} '${JSON.stringify(writePayload)}'`);

      // Close file
      const closePayload = { execute: 'guest-file-close', arguments: { handle } };
      await execAsync(`virsh qemu-agent-command ${vmName} '${JSON.stringify(closePayload)}'`);

      // Set permissions if specified
      if (transfer.permissions) {
        await guestExec(vmName, {
          cmd: `chmod ${transfer.permissions} ${transfer.destination}`,
          description: 'Set file permissions'
        });
      }

      return {
        success: true,
        vmName,
        operation: 'transfer-file',
        output: `Transferred ${transfer.source} to ${transfer.destination}`,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        vmName,
        operation: 'transfer-file',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Helper: Wait for conditions
  async function waitForConditions(vm: VMConfig, conditions: WaitCondition[]): Promise<void> {
    for (const condition of conditions) {
      const timeout = (condition.timeout || 60) * 1000;
      const interval = (condition.retryInterval || 2) * 1000;
      const start = Date.now();

      mainWindow.webContents.send('vm:waitCondition', {
        vmName: vm.name,
        condition: condition.type,
        status: 'waiting'
      });

      while (Date.now() - start < timeout) {
        let ready = false;

        switch (condition.type) {
          case 'agent':
            ready = await isAgentReady(vm.name);
            break;

          case 'port':
            if (condition.target) {
              const state = await getVMState(vm.name);
              if (state.ipAddress) {
                try {
                  await execAsync(`nc -zv ${state.ipAddress} ${condition.target}`, { timeout: 2000 });
                  ready = true;
                } catch { /* not ready */ }
              }
            }
            break;

          case 'http':
          case 'https':
            if (condition.target) {
              try {
                const { stdout } = await execAsync(
                  `curl -sf -o /dev/null -w "%{http_code}" ${condition.target}`,
                  { timeout: 5000 }
                );
                ready = condition.expectedResponse
                  ? stdout === condition.expectedResponse
                  : stdout.startsWith('2') || stdout === '301' || stdout === '302';
              } catch { /* not ready */ }
            }
            break;

          case 'command':
            if (condition.command) {
              try {
                await execAsync(condition.command, { timeout: 5000 });
                ready = true;
              } catch { /* not ready */ }
            }
            break;

          case 'file':
            if (condition.target) {
              const result = await guestExec(vm.name, {
                cmd: `test -e ${condition.target}`,
                description: `Check file ${condition.target}`,
                ignoreError: true
              });
              ready = result.success;
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

        await new Promise(r => setTimeout(r, interval));
      }
    }
  }

  // Helper: Run post-boot configuration
  async function runPostBoot(vm: VMConfig): Promise<void> {
    if (!vm.postBoot) return;

    mainWindow.webContents.send('vm:postBootStart', { vmName: vm.name });

    // Wait for conditions (always wait for agent first implicitly)
    const conditions: WaitCondition[] = [
      { type: 'agent', timeout: 120 },
      ...(vm.postBoot.waitFor || [])
    ];
    await waitForConditions(vm, conditions);

    // Transfer files
    if (vm.postBoot.files) {
      for (const file of vm.postBoot.files) {
        mainWindow.webContents.send('vm:fileTransfer', {
          vmName: vm.name,
          file: file.destination,
          status: 'transferring'
        });

        const result = await guestFileWrite(vm.name, file);

        mainWindow.webContents.send('vm:fileTransfer', {
          vmName: vm.name,
          file: file.destination,
          status: result.success ? 'complete' : 'error',
          error: result.error
        });
      }
    }

    // Run commands
    if (vm.postBoot.commands) {
      for (const command of vm.postBoot.commands) {
        if (command.condition) {
          try {
            if (!eval(command.condition)) continue;
          } catch { continue; }
        }

        mainWindow.webContents.send('vm:commandStart', {
          vmName: vm.name,
          command: command.description || command.cmd
        });

        let retries = command.retries || 0;
        let result: VMOperationResult;

        do {
          result = await guestExec(vm.name, command);
          if (result.success || retries <= 0) break;
          await new Promise(r => setTimeout(r, (command.retryDelay || 5) * 1000));
          retries--;
        } while (true);

        mainWindow.webContents.send('vm:commandComplete', {
          vmName: vm.name,
          command: command.description || command.cmd,
          success: result.success,
          error: result.error
        });

        if (!result.success && !command.ignoreError) {
          throw new Error(`Command failed: ${command.description || command.cmd} - ${result.error}`);
        }
      }
    }

    mainWindow.webContents.send('vm:postBootComplete', { vmName: vm.name });
  }

  // Helper: Run hooks
  async function runHooks(hooks: string[] | undefined): Promise<void> {
    if (!hooks) return;
    for (const cmd of hooks) {
      await execAsync(cmd);
    }
  }

  // Helper: Create VM
  async function createVM(vm: VMConfig): Promise<VMOperationResult> {
    try {
      let xmlContent = await fs.readFile(vm.domainXmlPath, 'utf-8');

      if (vmConfig?.variables) {
        xmlContent = applyVariables(xmlContent, vmConfig.variables);
      }
      if (vm.variables) {
        xmlContent = applyVariables(xmlContent, vm.variables);
      }

      await runHooks(vm.hooks?.beforeCreate);

      const tmpXmlPath = path.join('/tmp', `${vm.name}-domain.xml`);
      await fs.writeFile(tmpXmlPath, xmlContent);
      const { stdout, stderr } = await execAsync(`virsh define ${tmpXmlPath}`);
      await fs.unlink(tmpXmlPath).catch(() => {});

      if (vm.autoStart) {
        await execAsync(`virsh autostart ${vm.name}`);
      }

      await runHooks(vm.hooks?.afterCreate);

      return { success: true, vmName: vm.name, operation: 'create', output: stdout || stderr, timestamp: new Date() };
    } catch (error: any) {
      return { success: false, vmName: vm.name, operation: 'create', error: error.message, timestamp: new Date() };
    }
  }

  // Helper: Start VM
  async function startVM(vmName: string): Promise<VMOperationResult> {
    try {
      const { stdout, stderr } = await execAsync(`virsh start ${vmName}`);
      return { success: true, vmName, operation: 'start', output: stdout || stderr, timestamp: new Date() };
    } catch (error: any) {
      return { success: false, vmName, operation: 'start', error: error.message, timestamp: new Date() };
    }
  }

  // IPC Handlers
  ipcMain.handle('vm:getConfig', async () => {
    try {
      const configPath = path.join(process.cwd(), 'vm-config.json');
      vmConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      return vmConfig;
    } catch {
      return { version: '1.0', vms: [], defaults: {}, variables: {} };
    }
  });

  ipcMain.handle('vm:saveConfig', async (_, config: VMConfigFile) => {
    try {
      await fs.writeFile(path.join(process.cwd(), 'vm-config.json'), JSON.stringify(config, null, 2));
      vmConfig = config;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('vm:getStates', async () => {
    try {
      const { stdout } = await execAsync('virsh list --all --name');
      const names = stdout.trim().split('\n').filter(Boolean);
      const states = await Promise.all(names.map(async name => {
        const state = await getVMState(name);
        vmStates.set(name, state);
        return state;
      }));
      return states;
    } catch {
      return [];
    }
  });

  ipcMain.handle('vm:getState', async (_, vmName: string) => {
    const state = await getVMState(vmName);
    vmStates.set(vmName, state);
    return state;
  });

  ipcMain.handle('vm:create', async (_, vm: VMConfig) => createVM(vm));

  ipcMain.handle('vm:start', async (_, vmName: string) => {
    try {
      const vm = vmConfig?.vms.find(v => v.name === vmName);

      // Start dependencies first
      if (vm?.depends_on) {
        for (const dep of vm.depends_on) {
          const depState = await getVMState(dep);
          if (depState.state !== 'running') {
            await startVM(dep);
          }
        }
      }

      await runHooks(vm?.hooks?.beforeStart);
      const result = await startVM(vmName);
      await runHooks(vm?.hooks?.afterStart);

      if (result.success && vm?.postBoot) {
        await runPostBoot(vm);
      }

      return result;
    } catch (error: any) {
      return { success: false, vmName, operation: 'start', error: error.message, timestamp: new Date() };
    }
  });

  ipcMain.handle('vm:stop', async (_, vmName: string, force = false) => {
    try {
      const vm = vmConfig?.vms.find(v => v.name === vmName);
      await runHooks(vm?.hooks?.beforeStop);

      const cmd = force ? `virsh destroy ${vmName}` : `virsh shutdown ${vmName}`;
      const { stdout, stderr } = await execAsync(cmd);

      await runHooks(vm?.hooks?.afterStop);

      return { success: true, vmName, operation: force ? 'force-stop' : 'stop', output: stdout || stderr, timestamp: new Date() };
    } catch (error: any) {
      return { success: false, vmName, operation: 'stop', error: error.message, timestamp: new Date() };
    }
  });

  ipcMain.handle('vm:delete', async (_, vmName: string) => {
    try {
      const state = await getVMState(vmName);
      if (state.state === 'running') {
        await execAsync(`virsh destroy ${vmName}`);
      }
      const { stdout, stderr } = await execAsync(`virsh undefine ${vmName} --remove-all-storage --snapshots-metadata`);
      return { success: true, vmName, operation: 'delete', output: stdout || stderr, timestamp: new Date() };
    } catch (error: any) {
      return { success: false, vmName, operation: 'delete', error: error.message, timestamp: new Date() };
    }
  });

  ipcMain.handle('vm:batchStart', async (_, vmNames: string[], parallel = false) => {
    const startTime = Date.now();
    const results = parallel
      ? await Promise.all(vmNames.map(startVM))
      : await vmNames.reduce(async (acc, name) => [...(await acc), await startVM(name)], Promise.resolve([] as VMOperationResult[]));

    const successful = results.filter(r => r.success).length;
    return { totalVMs: vmNames.length, successful, failed: vmNames.length - successful, results, duration: Date.now() - startTime };
  });

  ipcMain.handle('vm:installProfile', async (_, profileName: string) => {
    const profile = vmConfig?.profiles?.[profileName];
    if (!profile) throw new Error(`Profile ${profileName} not found`);

    const vms = profile.vms
      .map(name => vmConfig!.vms.find(v => v.name === name))
      .filter((vm): vm is VMConfig => !!vm)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const results: VMOperationResult[] = [];

    for (const vm of vms) {
      mainWindow.webContents.send('vm:installProgress', { vmName: vm.name, status: 'creating', message: `Creating VM ${vm.name}...` });
      const createResult = await createVM(vm);
      results.push(createResult);

      if (!createResult.success) {
        mainWindow.webContents.send('vm:installProgress', { vmName: vm.name, status: 'error', message: `Failed to create: ${createResult.error}` });
        continue;
      }

      mainWindow.webContents.send('vm:installProgress', { vmName: vm.name, status: 'starting', message: `Starting VM ${vm.name}...` });
      const startResult = await startVM(vm.name);
      results.push(startResult);

      if (!startResult.success) {
        mainWindow.webContents.send('vm:installProgress', { vmName: vm.name, status: 'error', message: `Failed to start: ${startResult.error}` });
        continue;
      }

      if (vm.postBoot) {
        await runPostBoot(vm);
      }

      mainWindow.webContents.send('vm:installProgress', { vmName: vm.name, status: 'complete', message: `VM ${vm.name} installed` });

      if (vm.autoStartDelay) {
        await new Promise(r => setTimeout(r, vm.autoStartDelay! * 1000));
      }
    }

    const successful = results.filter(r => r.success).length;
    return { totalVMs: vms.length * 2, successful, failed: results.length - successful, results, duration: 0 };
  });

  ipcMain.handle('vm:executeCommand', async (_, vmName: string, command: PostBootCommand) => {
    return guestExec(vmName, command);
  });

  ipcMain.handle('vm:transferFile', async (_, vmName: string, transfer: FileTransfer) => {
    return guestFileWrite(vmName, transfer);
  });
}
