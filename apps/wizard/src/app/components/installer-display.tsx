import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Info, CheckCircle2 } from 'lucide-react';

interface InstallerDisplayProps {
  title?: string;
  content: string[];
  variables: Record<string, any>;
}

export function InstallerDisplay({ title, content, variables }: InstallerDisplayProps) {
  // Replace variables in content
  const processContent = (text: string) => {
    let processed = text;
    for (const [key, val] of Object.entries(variables)) {
      let displayValue = val;
      
      // Format arrays nicely
      if (Array.isArray(val)) {
        displayValue = val.join(', ');
      } else if (typeof val === 'boolean') {
        displayValue = val ? 'Yes' : 'No';
      } else if (val === null || val === undefined || val === '') {
        displayValue = '<not set>';
      }
      
      processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), String(displayValue));
    }
    return processed;
  };

  return (
    <Card className="bg-slate-800/60 border-green-500/30 shadow-xl shadow-green-500/5 rounded-xl animate-in fade-in zoom-in-95 duration-300">
      <CardHeader className="bg-gradient-to-r from-green-600/20 to-blue-600/20 border-b border-slate-700">
        <CardTitle className="text-white flex items-center gap-2">
          <Info className="w-5 h-5 text-green-400" />
          {title || 'Information'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {content.map((line, index) => {
            const processed = processContent(line);
            const [label, ...valueParts] = processed.split(':');
            const value = valueParts.join(':').trim();
            
            if (value) {
              return (
                <div key={index} className="flex items-start justify-between py-2 border-b border-slate-700/50">
                  <span className="text-slate-400 font-medium">{label}:</span>
                  <span className="text-white text-right ml-4">{value}</span>
                </div>
              );
            }
            
            return (
              <div key={index} className="py-2">
                <p className="text-slate-300">{processed}</p>
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Review the information above before proceeding</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}