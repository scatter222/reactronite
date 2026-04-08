import { useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, Terminal, Network, HardDrive, Monitor, Server } from 'lucide-react';
import type { UserConfig } from '@/app/types/installer-config';

interface CompletionStageProps {
  config: UserConfig;
  onComplete: () => void;
}

export function CompletionStage({ config, onComplete }: CompletionStageProps) {
  // Remove autostart entry on completion so the wizard doesn't run again on next login
  useEffect(() => {
    electron.ipcRenderer.invoke('installer:completeSetup').catch(console.error);
  }, []);
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
          Environment Ready!
        </h2>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Your KVM host has been configured and is ready to deploy virtual machines.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" />
              Environment Summary
            </CardTitle>
            <CardDescription className="text-slate-400">
              Your KVM host configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.hostname && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Hostname:</span>
                <span className="text-white font-medium">{config.hostname}</span>
              </div>
            )}
            {config.bridgeName && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Bridge Network:</span>
                <span className="text-white font-medium">{config.bridgeName}</span>
              </div>
            )}
            {config.bridgeSubnet && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">VM Subnet:</span>
                <span className="text-white font-mono">{config.bridgeSubnet}</span>
              </div>
            )}
            {config.storagePoolPath && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Storage Pool:</span>
                <span className="text-white font-mono">{config.storagePoolPath}</span>
              </div>
            )}
            {config.timezone && (
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">Timezone:</span>
                <span className="text-white">{config.timezone}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white">What Was Configured</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <Network className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  Bridge network <span className="text-white font-mono">{config.bridgeName || 'virbr-lan'}</span> with NAT and DHCP
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <HardDrive className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  Storage pool at <span className="text-white font-mono">{config.storagePoolPath || '/var/lib/libvirt/images'}</span>
                </li>
                {config.downloadBaseImage && (
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <Monitor className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    Ubuntu 24.04 cloud image downloaded
                  </li>
                )}
                {config.enableCockpit && (
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <Terminal className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    Cockpit web console on port 9090
                  </li>
                )}
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <Server className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  IP forwarding and bridge networking enabled
                </li>
              </ul>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 mt-4">
              <p className="text-sm text-slate-300 mb-2 font-medium">Quick commands:</p>
              <div className="space-y-2 font-mono text-xs text-slate-400">
                <p><span className="text-blue-400">$</span> virsh list --all <span className="text-slate-600"># list VMs</span></p>
                <p><span className="text-blue-400">$</span> virsh net-list --all <span className="text-slate-600"># list networks</span></p>
                <p><span className="text-blue-400">$</span> virsh pool-list --all <span className="text-slate-600"># list storage</span></p>
              </div>
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
          Go to VM Manager
        </Button>
      </div>
    </div>
  );
}