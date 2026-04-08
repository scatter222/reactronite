import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { CheckCircle2, ChevronRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { InstallCommand } from '@/app/types/installer-config';

interface InstallerPromptProps {
  prompt: InstallCommand;
  variables: Record<string, any>;
  onSubmit: (value: any) => void;
}

export function InstallerPrompt({ prompt, variables, onSubmit }: InstallerPromptProps) {
  const [value, setValue] = useState<any>(prompt.default ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>(() => {
    if (prompt.promptType === 'multiselect' && prompt.options) {
      return prompt.options.filter(opt => opt.selected).map(opt => opt.value);
    }
    return [];
  });

  // Replace variables in message
  const processMessage = (text: string) => {
    let processed = text;
    for (const [key, val] of Object.entries(variables)) {
      processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
    }
    return processed;
  };

  const validate = () => {
    if (prompt.required && !prompt.allowEmpty && !value) {
      setError('This field is required');
      return false;
    }
    
    if (prompt.validation && value) {
      const regex = new RegExp(prompt.validation);
      if (!regex.test(value)) {
        setError('Invalid format');
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    
    let submitValue = value;
    if (prompt.promptType === 'confirm') {
      submitValue = value === true || value === 'yes';
    } else if (prompt.promptType === 'multiselect') {
      submitValue = selectedOptions;
    }
    
    onSubmit(submitValue);
  };

  const toggleOption = (optionValue: string) => {
    setSelectedOptions(prev => {
      if (prev.includes(optionValue)) {
        return prev.filter(v => v !== optionValue);
      }
      return [...prev, optionValue];
    });
  };

  return (
    <Card className="bg-slate-800/60 border-blue-500/50 shadow-xl shadow-blue-500/10 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardHeader className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-slate-700">
        <CardTitle className="text-white flex items-center gap-2">
          <ChevronRight className="w-5 h-5 text-blue-400" />
          User Input Required
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <p className="text-slate-200 mb-4">{processMessage(prompt.message || prompt.description)}</p>
        
        {prompt.promptType === 'input' && (
          <div className="space-y-2">
            <Input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              placeholder="Enter value..."
              className="bg-slate-900/50 border-slate-600 text-white"
              autoFocus
            />
          </div>
        )}
        
        {prompt.promptType === 'password' && (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError('');
                }}
                placeholder="Enter password..."
                className="bg-slate-900/50 border-slate-600 text-white pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {prompt.allowEmpty && (
              <p className="text-xs text-slate-400">Leave empty for no password</p>
            )}
          </div>
        )}
        
        {prompt.promptType === 'confirm' && (
          <div className="flex gap-4">
            <Button
              onClick={() => {
                onSubmit(true);
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Yes
            </Button>
            <Button
              onClick={() => {
                onSubmit(false);
              }}
              variant="outline"
              className="flex-1 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              No
            </Button>
          </div>
        )}
        
        {prompt.promptType === 'select' && prompt.options && (
          <div className="space-y-2">
            {prompt.options.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  setValue(option.value);
                  setError('');
                }}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  value === option.value
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {value === option.value && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                </div>
              </button>
            ))}
          </div>
        )}
        
        {prompt.promptType === 'multiselect' && prompt.options && (
          <div className="space-y-2">
            {prompt.options.map(option => (
              <button
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedOptions.includes(option.value)
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {selectedOptions.includes(option.value) && (
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  )}
                </div>
              </button>
            ))}
            <p className="text-xs text-slate-400 mt-2">
              Select multiple options ({selectedOptions.length} selected)
            </p>
          </div>
        )}
        
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        
        {(prompt.promptType === 'input' || prompt.promptType === 'password') && (
          <div className="flex justify-end mt-4">
            <Button
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Continue
            </Button>
          </div>
        )}
        
        {prompt.promptType === 'select' && value && (
          <div className="flex justify-end mt-4">
            <Button
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Continue
            </Button>
          </div>
        )}
        
        {prompt.promptType === 'multiselect' && (
          <div className="flex justify-end mt-4">
            <Button
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={selectedOptions.length === 0 && prompt.required}
            >
              Continue ({selectedOptions.length} selected)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}