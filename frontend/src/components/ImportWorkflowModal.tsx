import { useState } from 'react';
import { createWorkflow } from '@/lib/api';
import { FileCode, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
}

export function ImportWorkflowModal({ onClose, onSuccess, open }: ImportModalProps) {
  const [jsonStr, setJsonStr] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setError('');
    setIsLoading(true);
    try {
      const parsed = JSON.parse(jsonStr);

      // Basic validation
      let name = parsed.name || 'Imported Workflow';
      let data = parsed.data || parsed; // fallback if they just pasted the graph

      await createWorkflow({
        name,
        data,
      });

      setJsonStr('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid JSON format');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setJsonStr('');
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[#1f1f23] border-[#2e2e33] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FileCode className="h-4 w-4 text-[#ff6d5a]" />
            Import Workflow
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-[13px]">
            Paste the raw JSON of your workflow below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <textarea
            value={jsonStr}
            onChange={(e) => setJsonStr(e.target.value)}
            placeholder='{ "name": "...", "data": { ... } }'
            rows={10}
            className="w-full rounded-md border border-[#2e2e33] bg-[#18181b] px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus:border-[#ff6d5a]/40 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
          />

          {error && <div className="text-[12px] font-medium text-red-400">{error}</div>}

          <Button
            onClick={handleImport}
            disabled={isLoading || !jsonStr.trim()}
            className="w-full bg-[#ff6d5a] hover:bg-[#e85a48] text-white h-9 text-[12px]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import Workflow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
