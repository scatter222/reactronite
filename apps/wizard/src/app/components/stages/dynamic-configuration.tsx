import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label-simple';
import { Switch } from '@/app/components/ui/switch-simple';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { AlertCircle, Eye, EyeOff, Shield, Key, Server, Clock } from 'lucide-react';
import type { InstallerConfig, ConfigField, UserConfig } from '@/app/types/installer-config';

interface DynamicConfigurationStageProps {
  onConfigChange: (config: UserConfig) => void;
  onNext: () => void;
}

export function DynamicConfigurationStage({ onConfigChange, onNext }: DynamicConfigurationStageProps) {
  const [config, setConfig] = useState<UserConfig>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [installerConfig, setInstallerConfig] = useState<InstallerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInstallerConfig();
  }, []);

  const loadInstallerConfig = async () => {
    try {
      const configData = await electron.ipcRenderer.invoke('installer:getConfig');
      setInstallerConfig(configData);
      
      // Initialize default values
      const defaults: UserConfig = {};
      configData.configFields.forEach((field: ConfigField) => {
        if (field.default !== undefined) {
          defaults[field.id] = field.default;
        } else if (field.type === 'boolean') {
          defaults[field.id] = false;
        }
      });
      setConfig(defaults);
      onConfigChange(defaults);
    } catch (error) {
      console.error('Failed to load installer config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    const newConfig = { ...config, [fieldId]: value };
    setConfig(newConfig);
    onConfigChange(newConfig);
    
    // Clear error for this field
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const togglePasswordVisibility = (fieldId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const validate = () => {
    if (!installerConfig) return false;
    
    const newErrors: Record<string, string> = {};
    
    installerConfig.configFields.forEach(field => {
      const value = config[field.id];
      
      // Required field check
      if (field.required && (!value || value === '')) {
        newErrors[field.id] = `${field.label} is required`;
        return;
      }
      
      // Type-specific validation
      if (value) {
        // Text validation with regex
        if (field.type === 'text' && field.validation) {
          const regex = new RegExp(field.validation);
          if (!regex.test(value)) {
            newErrors[field.id] = `Invalid format for ${field.label}`;
          }
        }
        
        // Password length validation
        if (field.type === 'password') {
          if (field.minLength && value.length < field.minLength) {
            newErrors[field.id] = `Minimum ${field.minLength} characters required`;
          }
          if (field.maxLength && value.length > field.maxLength) {
            newErrors[field.id] = `Maximum ${field.maxLength} characters allowed`;
          }
        }
        
        // Number validation
        if (field.type === 'number') {
          const num = Number(value);
          if (field.min !== undefined && num < field.min) {
            newErrors[field.id] = `Minimum value is ${field.min}`;
          }
          if (field.max !== undefined && num > field.max) {
            newErrors[field.id] = `Maximum value is ${field.max}`;
          }
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  const renderField = (field: ConfigField) => {
    const value = config[field.id] ?? '';
    const error = errors[field.id];
    const showPassword = showPasswords[field.id];

    switch (field.type) {
      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-slate-200">
              {field.label}
            </Label>
            <Input
              id={field.id}
              type="text"
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              className={`bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 ${
                error ? 'border-red-500' : ''
              }`}
            />
            {field.description && !error && (
              <p className="text-sm text-slate-400">{field.description}</p>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'password':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-slate-200 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400" />
              {field.label}
            </Label>
            <div className="relative">
              <Input
                id={field.id}
                type={showPassword ? 'text' : 'password'}
                value={value}
                onChange={(e) => handleInputChange(field.id, e.target.value)}
                placeholder="••••••••"
                className={`bg-slate-900/50 border-slate-600 text-white pr-10 ${
                  error ? 'border-red-500' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility(field.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {field.description && !error && (
              <p className="text-sm text-slate-400">{field.description}</p>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-slate-200">
              {field.label}
            </Label>
            <Input
              id={field.id}
              type="number"
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              className={`bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 ${
                error ? 'border-red-500' : ''
              }`}
            />
            {field.description && !error && (
              <p className="text-sm text-slate-400">{field.description}</p>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.id} className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <Label htmlFor={field.id} className="text-slate-200">
                {field.label}
              </Label>
              {field.description && (
                <p className="text-sm text-slate-400">{field.description}</p>
              )}
            </div>
            <Switch
              id={field.id}
              checked={value || false}
              onCheckedChange={(checked) => handleInputChange(field.id, checked)}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-slate-200">
              {field.label}
            </Label>
            <select
              id={field.id}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {field.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {field.description && (
              <p className="text-sm text-slate-400">{field.description}</p>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!installerConfig) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center text-red-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <p>Failed to load installer configuration</p>
        </div>
      </div>
    );
  }

  // Group fields by category
  const securityFields = installerConfig.configFields.filter(f => 
    f.id.includes('Password') || f.id.includes('ssh') || f.id.includes('luks')
  );
  const systemFields = installerConfig.configFields.filter(f => 
    !securityFields.includes(f) && f.type !== 'boolean'
  );
  const optionFields = installerConfig.configFields.filter(f => 
    f.type === 'boolean' && !securityFields.includes(f)
  );

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">System Configuration</h2>
        <p className="text-slate-400">Configure your system settings and security parameters</p>
      </div>

      <div className="space-y-6">
        {/* System Settings */}
        {systemFields.length > 0 && (
          <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-400" />
                System Settings
              </CardTitle>
              <CardDescription className="text-slate-400">
                Basic system configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {systemFields.map(renderField)}
            </CardContent>
          </Card>
        )}

        {/* Security Settings */}
        {securityFields.length > 0 && (
          <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                Security Configuration
              </CardTitle>
              <CardDescription className="text-slate-400">
                Passwords and encryption settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {securityFields.map(renderField)}
            </CardContent>
          </Card>
        )}

        {/* Additional Options */}
        {optionFields.length > 0 && (
          <Card className="bg-slate-800/40 border-slate-700/50 backdrop-blur-sm rounded-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                Additional Options
              </CardTitle>
              <CardDescription className="text-slate-400">
                Optional features and settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {optionFields.map(renderField)}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-end mt-8">
        <Button
          onClick={handleNext}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 rounded-lg"
        >
          Continue to Pre-Installation Checks
        </Button>
      </div>
    </div>
  );
}