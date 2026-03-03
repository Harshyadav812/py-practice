import { useState, useEffect } from 'react';
import { getCredentials, createCredential, deleteCredential } from '@/lib/api';
import { Key, Trash2, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface CredentialsModalProps {
  onClose: () => void;
  open: boolean;
}

interface Credential {
  id: string;
  name: string;
  type: string;
}

export function CredentialsModal({ onClose, open }: CredentialsModalProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState('api_key');
  const [dataStr, setDataStr] = useState('{\n  "token": "your_token_here"\n}');

  const fetchCredentials = async () => {
    try {
      const data = await getCredentials();
      setCredentials(data);
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCredentials();
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      setIsLoading(true);
      const parsedData = JSON.parse(dataStr);
      await createCredential({ name, type, data: parsedData });
      setName('');
      setDataStr('{\n  "token": "your_token_here"\n}');
      toast.success('Credential created successfully');
      await fetchCredentials();
    } catch (err) {
      toast.error('Failed to create credential. Make sure data is valid JSON.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCredential(id);
      toast.success('Credential deleted');
      await fetchCredentials();
    } catch (err) {
      toast.error('Failed to delete credential');
      console.error(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl bg-[#1f1f23] border-[#2e2e33] text-zinc-100 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Key className="h-4 w-4 text-[#ff6d5a]" />
            Credentials
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-[13px]">
            Manage your API keys and authentication tokens.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6 py-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-widest">
              Your Credentials
            </h3>
            {credentials.length === 0 ? (
              <p className="text-zinc-500 text-[12px]">No credentials found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {credentials.map((c) => (
                  <div key={c.id} className="flex justify-between items-center p-2.5 bg-[#18181b] border border-[#2e2e33] rounded-lg">
                    <div>
                      <div className="font-medium text-[12px] text-zinc-200">{c.name}</div>
                      <div className="text-[10px] text-zinc-500">{c.type}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(c.id)}
                      className="h-7 w-7 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#2e2e33] pt-5">
            <h3 className="mb-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
              Add New Credential
            </h3>
            <div className="flex flex-col gap-2.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Credential Name (e.g. OpenAI Key)"
                className="bg-[#18181b] border-[#2e2e33] text-zinc-200 placeholder:text-zinc-600 h-9 text-[12px] focus:border-[#ff6d5a]/40"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-[#2e2e33] bg-[#18181b] px-3 py-2 text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#ff6d5a]/40 disabled:cursor-not-allowed disabled:opacity-50 text-zinc-200"
              >
                <option value="api_key">API Key</option>
                <option value="oauth2">OAuth2</option>
                <option value="basic_auth">Basic Auth</option>
              </select>
              <textarea
                value={dataStr}
                onChange={e => setDataStr(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[#2e2e33] bg-[#18181b] px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus:border-[#ff6d5a]/40 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
              />
              <Button
                onClick={handleCreate}
                disabled={isLoading || !name.trim()}
                className="w-full bg-[#ff6d5a] hover:bg-[#e85a48] text-white h-8 text-[12px]"
              >
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Credential
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
