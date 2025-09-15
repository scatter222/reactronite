import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, FolderOpen, Terminal, FileText, ExternalLink } from 'lucide-react';
import type { InstallConfig } from '@/app/screens/installer';

interface CompletionStageProps {
  config: InstallConfig;
  onComplete: () => void;
}

export function CompletionStage({ config, onComplete }: CompletionStageProps) {
  const openFolder = () => {
    // This would open the installation folder in the file explorer
    electron.ipcRenderer.invoke('shell:openPath', config.installPath);
  };

  const openTerminal = () => {
    // This would open a terminal at the installation path
    electron.ipcRenderer.invoke('shell:openTerminal', config.installPath);
  };

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
          Your project <span className="text-blue-400 font-semibold">"{config.projectName}"</span> has been successfully installed and configured.
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
            <div className="flex justify-between py-2 border-b border-slate-700">
              <span className="text-slate-400">Project Name:</span>
              <span className="text-white font-medium">{config.projectName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-700">
              <span className="text-slate-400">Installation Path:</span>
              <span className="text-white font-mono text-sm">{config.installPath}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-700">
              <span className="text-slate-400">Logging Enabled:</span>
              <span className="text-white">{config.enableLogging ? 'Yes' : 'No'}</span>
            </div>
            {config.customOptions.apiEndpoint && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">API Endpoint:</span>
                <span className="text-white font-mono text-sm">{config.customOptions.apiEndpoint}</span>
              </div>
            )}
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
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={openFolder}
                variant="outline"
                className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 justify-start"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Open Project Folder
              </Button>
              
              <Button
                onClick={openTerminal}
                variant="outline"
                className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 justify-start"
              >
                <Terminal className="w-4 h-4 mr-2" />
                Open Terminal
              </Button>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <p className="text-sm text-slate-300 mb-2">To start developing, run:</p>
              <code className="block bg-slate-950 rounded px-3 py-2 text-blue-400 font-mono text-sm">
                cd {config.installPath} && npm run dev
              </code>
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