import { useState } from 'react';
import { Key, Plus } from 'lucide-react';
import { CredentialsModal } from '@/components/CredentialsModal';
import { Button } from '@/components/ui/button';

export function CredentialsPage() {
    const [showModal, setShowModal] = useState(false);

    return (
        <div className="min-h-full bg-[#18181b] p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
                            Credentials
                        </h1>
                        <p className="text-[13px] text-zinc-500 mt-0.5">
                            Manage API keys, tokens and connection configs
                        </p>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => setShowModal(true)}
                        className="bg-node-trigger hover:bg-accent-hover text-white h-8 text-[12px] shadow-sm"
                    >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Credential
                    </Button>
                </div>

                {/* Empty state */}
                <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-[#2e2e33] bg-surface/50 p-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-hover mb-4">
                        <Key className="h-7 w-7 text-zinc-500" />
                    </div>
                    <h3 className="text-base font-medium text-zinc-200 mb-1.5">Manage your credentials</h3>
                    <p className="text-[13px] text-zinc-500 max-w-xs mb-5">
                        Store API keys and tokens securely for use in your workflow nodes.
                    </p>
                    <Button
                        size="sm"
                        onClick={() => setShowModal(true)}
                        className="bg-node-trigger hover:bg-accent-hover text-white h-8 text-[12px]"
                    >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Credential
                    </Button>
                </div>
            </div>

            <CredentialsModal
                open={showModal}
                onClose={() => setShowModal(false)}
            />
        </div>
    );
}
