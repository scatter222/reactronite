import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, FolderOpen, Terminal, FileText, Shield, Server } from 'lucide-react';
import type { UserConfig } from '@/app/types/installer-config';

interface CompletionStageProps {
  config: UserConfig;
  onComplete: () => void;
}

export function CompletionStage({ config, onComplete }: CompletionStageProps) {
  const openTerminal = () => {
    // Open a terminal window
    electron.ipcRenderer.invoke('shell:openTerminal', process.cwd());
  };

  if (!config) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center">
          <p className="text-slate-400">Loading completion information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-600/20 rounded-full mb-6">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        
        <h2 className="text-4xl font-bold text-white mb-4">
          Installation Complete!
        </h2>
        
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Your system has been successfully configured and all components have been installed.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white">Installation Summary</CardTitle>
            <CardDescription className="text-slate-400">
              Review your installation details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.hostname && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Hostname:</span>
                <span className="text-white font-medium">{config.hostname}</span>
              </div>
            )}
            {config.username && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Admin User:</span>
                <span className="text-white font-medium">{config.username}</span>
              </div>
            )}
            {config.sshPort && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">SSH Port:</span>
                <span className="text-white">{config.sshPort}</span>
              </div>
            )}
            {config.enableFirewall !== undefined && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Firewall:</span>
                <span className="text-white">{config.enableFirewall ? 'Enabled' : 'Disabled'}</span>
              </div>
            )}
            {config.timezone && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Timezone:</span>
                <span className="text-white">{config.timezone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2 text-green-400">
              <Shield className="w-4 h-4" />
              <span className="text-sm">Security configurations applied</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white">Next Steps</CardTitle>
            <CardDescription className="text-slate-400">
              Get started with your newly installed project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={openTerminal}
              variant="outline"
              className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 justify-start"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Open Terminal
            </Button>

            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-sm text-slate-300 mb-2">Your system is now configured with:</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  SSH keys generated and configured
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Security hardening applied
                </li>
                {config.enableFirewall && (
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    Firewall configured and enabled
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  System timezone configured
                </li>
              </ul>
            </div>

            <div className="flex items-start gap-3 text-sm text-slate-400">
              <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Check the README.md file in your project directory for detailed documentation and usage instructions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-4">
        <Button
          onClick={onComplete}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25"
        >
          Finish Installation
        </Button>
        
        <Button
          onClick={() => {
            // Reset and start new installation
            window.location.reload();
          }}
          variant="outline"
          size="lg"
          className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          New Installation
        </Button>
      </div>
    </div>
  );
}