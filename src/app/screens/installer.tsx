import { useState } from 'react';
import { Check, ChevronRight, Package2, Settings, Terminal, FileCheck, Shield } from 'lucide-react';
import { DynamicConfigurationStage } from '@/app/components/stages/dynamic-configuration';
import { PreChecksStage } from '@/app/components/stages/pre-checks';
import { AdvancedInstallationStage } from '@/app/components/stages/advanced-installation';
import { CompletionStage } from '@/app/components/stages/completion';
import { useNavigate } from 'react-router-dom';
import type { UserConfig } from '@/app/types/installer-config';

export interface InstallConfig {
  projectName: string;
  installPath: string;
  enableLogging: boolean;
  customOptions: Record<string, string>;
}

export type StageStatus = 'pending' | 'active' | 'completed';

export interface Stage {
  id: string;
  label: string;
  icon: React.ElementType;
  status: StageStatus;
}

export function InstallerScreen() {
  const navigate = useNavigate();
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [userConfig, setUserConfig] = useState<UserConfig>({});

  const [stages, setStages] = useState<Stage[]>([
    { id: 'config', label: 'Configuration', icon: Settings, status: 'active' },
    { id: 'precheck', label: 'Pre-Checks', icon: Shield, status: 'pending' },
    { id: 'install', label: 'Installation', icon: Terminal, status: 'pending' },
    { id: 'complete', label: 'Completion', icon: FileCheck, status: 'pending' }
  ]);

  const updateStageStatus = (index: number, status: StageStatus) => {
    setStages(prev => prev.map((stage, i) => 
      i === index ? { ...stage, status } : stage
    ));
  };

  const handleNext = () => {
    if (currentStageIndex < stages.length - 1) {
      updateStageStatus(currentStageIndex, 'completed');
      updateStageStatus(currentStageIndex + 1, 'active');
      setCurrentStageIndex(currentStageIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStageIndex > 0) {
      updateStageStatus(currentStageIndex, 'pending');
      updateStageStatus(currentStageIndex - 1, 'active');
      setCurrentStageIndex(currentStageIndex - 1);
    }
  };

  const handleComplete = () => {
    navigate('/');
  };

  const renderStageContent = () => {
    switch (stages[currentStageIndex].id) {
      case 'config':
        return (
          <DynamicConfigurationStage 
            onConfigChange={setUserConfig}
            onNext={handleNext}
          />
        );
      case 'precheck':
        return (
          <PreChecksStage
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'install':
        return (
          <AdvancedInstallationStage 
            config={userConfig}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'complete':
        return (
          <CompletionStage 
            config={userConfig}
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex relative">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900/60 border-r border-slate-800/50 backdrop-blur-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Package2 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-white">Installation Wizard</h2>
          </div>
          
          <div className="space-y-2">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const isActive = stage.status === 'active';
              const isCompleted = stage.status === 'completed';
              const isPending = stage.status === 'pending';
              
              return (
                <div
                  key={stage.id}
                  className={`
                    relative flex items-center gap-3 p-4 rounded-xl transition-all duration-200
                    ${isActive 
                      ? 'bg-slate-800/60 shadow-inner border border-slate-700/30 backdrop-blur-sm' 
                      : isPending 
                        ? 'opacity-50' 
                        : 'opacity-100'
                    }
                  `}
                >
                  <div className={`
                    relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200
                    ${isActive 
                      ? 'bg-blue-600 shadow-lg shadow-blue-600/30' 
                      : isCompleted 
                        ? 'bg-green-600 shadow-lg shadow-green-600/20' 
                        : 'bg-slate-700'
                    }
                  `}>
                    {isCompleted ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className="w-5 h-5 text-white" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <p className={`
                      font-medium transition-all duration-200
                      ${isActive ? 'text-white' : 'text-slate-400'}
                    `}>
                      {stage.label}
                    </p>
                    {isActive && (
                      <p className="text-xs text-blue-400 mt-0.5">In Progress</p>
                    )}
                    {isCompleted && (
                      <p className="text-xs text-green-400 mt-0.5">Completed</p>
                    )}
                  </div>
                  
                  {isActive && (
                    <ChevronRight className="w-5 h-5 text-blue-400 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          {renderStageContent()}
        </div>
      </div>
    </div>
  );
}