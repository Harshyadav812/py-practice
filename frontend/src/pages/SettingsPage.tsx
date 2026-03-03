import { Settings as SettingsIcon, User, Shield, Bell } from 'lucide-react';

export function SettingsPage() {
    const sections = [
        { icon: User, label: 'Account', desc: 'Manage your profile and account details' },
        { icon: Shield, label: 'Security', desc: 'Password, two-factor authentication' },
        { icon: Bell, label: 'Notifications', desc: 'Configure email and alert preferences' },
        { icon: SettingsIcon, label: 'General', desc: 'Application preferences and defaults' },
    ];

    return (
        <div className="min-h-full bg-[#18181b] p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
                        Settings
                    </h1>
                    <p className="text-[13px] text-zinc-500 mt-0.5">
                        Manage your application preferences
                    </p>
                </div>

                {/* Settings sections */}
                <div className="space-y-1">
                    {sections.map(({ icon: Icon, label, desc }) => (
                        <div
                            key={label}
                            className="flex items-center gap-3 px-4 py-3.5 rounded-lg border border-transparent hover:border-[#2e2e33] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2f] group-hover:bg-[#33333a]">
                                <Icon className="h-4 w-4 text-zinc-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium text-zinc-200">{label}</div>
                                <div className="text-[11px] text-zinc-500">{desc}</div>
                            </div>
                            <div className="text-[11px] text-zinc-600">Coming soon</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
