import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Settings,
    Activity,
    Key,
    LogOut,
    PanelLeft,
    Workflow
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import clsx from 'clsx';

export function AppLayout() {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const logout = useAuthStore((s) => s.logout);
    const location = useLocation();

    const isCanvas = location.pathname.startsWith('/canvas');

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Workflows' },
        { to: '/executions', icon: Activity, label: 'Executions' },
        { to: '/credentials', icon: Key, label: 'Credentials' },
        { to: '/settings', icon: Settings, label: 'Settings' },
    ];

    return (
        <div className="flex h-screen bg-[#18181b] text-zinc-100 overflow-hidden">
            {/* Sidebar — n8n-inspired clean minimal sidebar */}
            <aside
                className={clsx(
                    "relative flex flex-col bg-surface transition-all duration-200 ease-in-out shrink-0",
                    isCollapsed ? 'w-13' : 'w-55'
                )}
            >
                {/* Logo / Brand */}
                <div className={clsx(
                    "flex items-center shrink-0 border-b border-[#2e2e33]",
                    isCollapsed ? "h-13 justify-center" : "h-13 px-4 gap-2.5"
                )}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-node-trigger text-white">
                        <Workflow size={15} strokeWidth={2.5} />
                    </div>
                    {!isCollapsed && (
                        <span className="font-semibold text-[13px] tracking-tight text-zinc-100 truncate">
                            Sentient Flow
                        </span>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) => clsx(
                                "flex items-center gap-2.5 rounded-md transition-all duration-150 relative group",
                                isCollapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 h-8",
                                isActive
                                    ? 'bg-white/8 text-zinc-100 font-medium'
                                    : 'text-zinc-400 hover:bg-white/4 hover:text-zinc-200'
                            )}
                            title={isCollapsed ? item.label : undefined}
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-4 bg-node-trigger rounded-r-full" />
                                    )}
                                    <item.icon size={16} className="shrink-0" />
                                    {!isCollapsed && <span className="text-[13px] truncate">{item.label}</span>}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Sidebar footer */}
                <div className="px-2 py-2 border-t border-[#2e2e33] space-y-0.5 shrink-0">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={clsx(
                            "flex items-center gap-2.5 rounded-md text-zinc-500 hover:bg-white/4 hover:text-zinc-300 transition-colors",
                            isCollapsed ? "justify-center h-9 w-9 mx-auto" : "w-full px-2.5 h-8"
                        )}
                        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <PanelLeft size={16} className={clsx("shrink-0 transition-transform", isCollapsed && "rotate-180")} />
                        {!isCollapsed && <span className="text-[13px]">Collapse</span>}
                    </button>
                    <button
                        onClick={() => logout()}
                        className={clsx(
                            "flex items-center gap-2.5 rounded-md text-zinc-500 hover:bg-white/4 hover:text-zinc-300 transition-colors",
                            isCollapsed ? "justify-center h-9 w-9 mx-auto" : "w-full px-2.5 h-8"
                        )}
                        title={isCollapsed ? 'Logout' : undefined}
                    >
                        <LogOut size={16} className="shrink-0" />
                        {!isCollapsed && <span className="text-[13px]">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <main className={clsx("flex-1", isCanvas ? "overflow-hidden" : "overflow-y-auto")}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
