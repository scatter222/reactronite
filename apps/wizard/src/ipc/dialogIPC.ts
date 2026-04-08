import { dialog, ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import { platform } from 'os';

export function registerDialogHandlers() {
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Installation Directory'
    });
    return result;
  });

  ipcMain.handle('shell:openPath', async (_, path: string) => {
    try {
      await shell.openPath(path);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('shell:openTerminal', async (_, path: string) => {
    try {
      const os = platform();
      
      if (os === 'win32') {
        // Windows - Open Command Prompt
        spawn('cmd.exe', [], {
          cwd: path,
          detached: true,
          shell: true
        });
      } else if (os === 'darwin') {
        // macOS - Open Terminal
        spawn('open', ['-a', 'Terminal', path], {
          detached: true
        });
      } else {
        // Linux - Try common terminal emulators
        const terminals = ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'];
        let opened = false;
        
        for (const terminal of terminals) {
          try {
            spawn(terminal, [], {
              cwd: path,
              detached: true
            });
            opened = true;
            break;
          } catch {
            continue;
          }
        }
        
        if (!opened) {
          throw new Error('No terminal emulator found');
        }
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}