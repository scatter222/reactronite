import { ipcMain, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { HardwareConfig, HardwareScript } from '../app/types/hardware-config';
import { getConfigDir } from '../main';

// Locate stdbuf so we can force line-buffered stdio on the child. Without this
// (or PYTHONUNBUFFERED for Python), most libc/Python programs switch to fully
// buffered output when stdout is a pipe, so logs only flush when the script
// exits — which makes streaming output look like a single dump at the end.
function findStdbuf(): string | null {
  for (const p of ['/usr/bin/stdbuf', '/usr/local/bin/stdbuf', '/opt/homebrew/bin/stdbuf']) {
    if (existsSync(p)) return p;
  }
  return null;
}
const STDBUF_PATH = findStdbuf();

export function registerHardwareHandlers(mainWindow: BrowserWindow) {
  let hardwareConfig: HardwareConfig | null = null;

  ipcMain.handle('hardware:getConfig', async () => {
    try {
      const configPath = path.join(getConfigDir(), 'hardware-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      hardwareConfig = JSON.parse(configData);
      return hardwareConfig;
    } catch (error) {
      console.error('Failed to load hardware config:', error);
      throw error;
    }
  });

  ipcMain.handle('hardware:runScript', async (_event, script: HardwareScript, variables: Record<string, string>) => {
    return new Promise((resolve) => {
      const scriptPath = path.resolve(getConfigDir(), script.scriptPath);

      // Build env vars from the variables the script needs
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      for (const v of script.variables) {
        if (variables[v.id] !== undefined) {
          env[v.id.toUpperCase()] = variables[v.id];
        }
      }
      // Force unbuffered output so logs stream live instead of arriving in one
      // dump when the script exits.
      env.PYTHONUNBUFFERED = '1';
      env.PYTHONIOENCODING = env.PYTHONIOENCODING ?? 'utf-8';

      const startTime = Date.now();

      // Check if script exists first
      fs.access(scriptPath).then(() => {
        const [cmd, args] = STDBUF_PATH
          ? [STDBUF_PATH, ['-oL', '-eL', 'bash', scriptPath]]
          : ['bash', [scriptPath]];
        const child = spawn(cmd, args, {
          env,
          shell: false,
        });

        let output = '';

        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          mainWindow.webContents.send('hardware:scriptOutput', {
            scriptId: script.id,
            type: 'stdout',
            data: chunk,
          });
        });

        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          mainWindow.webContents.send('hardware:scriptOutput', {
            scriptId: script.id,
            type: 'stderr',
            data: chunk,
          });
        });

        child.on('close', (code) => {
          const duration = Date.now() - startTime;
          const success = code === (script.expectedExitCode ?? 0);
          resolve({
            id: script.id,
            name: script.name,
            status: success ? 'success' : 'error',
            exitCode: code,
            output,
            duration,
            error: success ? undefined : `Exited with code ${code}`,
          });
        });

        child.on('error', (error) => {
          const duration = Date.now() - startTime;
          resolve({
            id: script.id,
            name: script.name,
            status: 'error',
            exitCode: -1,
            output: error.message,
            duration,
            error: error.message,
          });
        });

        // Timeout
        if (script.timeout) {
          setTimeout(() => {
            child.kill();
            resolve({
              id: script.id,
              name: script.name,
              status: 'error',
              exitCode: -1,
              output: output + '\nScript timed out',
              duration: Date.now() - startTime,
              error: `Timed out after ${script.timeout}ms`,
            });
          }, script.timeout);
        }
      }).catch(() => {
        // Script file doesn't exist — run in demo mode
        resolve({
          id: script.id,
          name: script.name,
          status: 'error',
          exitCode: -1,
          output: `Script not found: ${scriptPath}`,
          duration: 0,
          error: `Script not found at ${scriptPath}. Place your script there and retry.`,
        });
      });
    });
  });
}
