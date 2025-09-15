import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label-simple';
import { Switch } from '@/app/components/ui/switch-simple';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { FolderOpen, AlertCircle } from 'lucide-react';
import type { InstallConfig } from '@/app/screens/installer';

interface ConfigurationStageProps {
  config: InstallConfig;
  onConfigChange: (config: InstallConfig) => void;
  onNext: () => void;
}

export function ConfigurationStage({ config, onConfigChange, onNext }: ConfigurationStageProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: keyof InstallConfig, value: any) => {
    onConfigChange({
      ...config,
      [field]: value
    });
    
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCustomOptionChange = (key: string, value: string) => {
    onConfigChange({
      ...config,
      customOptions: {
        ...config.customOptions,
        [key]: value
      }
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!config.projectName.trim()) {
      newErrors.projectName = 'Project name is required';
    }
    
    if (!config.installPath.trim()) {
      newErrors.installPath = 'Installation path is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  const selectFolder = async () => {
    // This would trigger Electron's dialog to select a folder
    // For now, we'll just set a sample path
    const result = await electron.ipcRenderer.invoke('dialog:openDirectory');
    if (result && !result.canceled && result.filePaths.length > 0) {
      handleInputChange('installPath', result.filePaths[0]);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Configuration</h2>
        <p className="text-slate-400">Configure your installation preferences and settings</p>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white">Basic Settings</CardTitle>
            <CardDescription className="text-slate-400">
              Essential configuration for your installation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName" className="text-slate-200">
                Project Name
              </Label>
              <Input
                id="projectName"
                type="text"
                value={config.projectName}
                onChange={(e) => handleInputChange('projectName', e.target.value)}
                placeholder="Enter your project name"
                className={`bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 ${
                  errors.projectName ? 'border-red-500' : ''
                }`}
              />
              {errors.projectName && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.projectName}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="installPath" className="text-slate-200">
                Installation Path
              </Label>
              <div className="flex gap-2">
                <Input
                  id="installPath"
                  type="text"
                  value={config.installPath}
                  onChange={(e) => handleInputChange('installPath', e.target.value)}
                  placeholder="/path/to/installation"
                  className={`flex-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 ${
                    errors.installPath ? 'border-red-500' : ''
                  }`}
                />
                <Button
                  type="button"
                  onClick={selectFolder}
                  variant="outline"
                  className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 rounded-lg"
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              {errors.installPath && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.installPath}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="logging" className="text-slate-200">
                  Enable Logging
                </Label>
                <p className="text-sm text-slate-400">
                  Save installation logs for debugging
                </p>
              </div>
              <Switch
                id="logging"
                checked={config.enableLogging}
                onCheckedChange={(checked) => handleInputChange('enableLogging', checked)}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-white">Advanced Options</CardTitle>
            <CardDescription className="text-slate-400">
              Additional configuration parameters (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customOption1" className="text-slate-200">
                API Endpoint
              </Label>
              <Input
                id="customOption1"
                type="text"
                value={config.customOptions.apiEndpoint || ''}
                onChange={(e) => handleCustomOptionChange('apiEndpoint', e.target.value)}
                placeholder="https://api.example.com"
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customOption2" className="text-slate-200">
                Max Threads
              </Label>
              <Input
                id="customOption2"
                type="number"
                value={config.customOptions.maxThreads || ''}
                onChange={(e) => handleCustomOptionChange('maxThreads', e.target.value)}
                placeholder="4"
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end mt-8">
        <Button
          onClick={handleNext}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25"
        >
          Continue to Installation
        </Button>
      </div>
    </div>
  );
}