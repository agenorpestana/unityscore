import React from 'react';
import { LayoutDashboard, Users, Settings, LogOut, Network, Trophy, FileText, MonitorPlay } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  userName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, userName }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pontua', label: 'Pontua', icon: Trophy },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const openTvMode = () => {
    window.open('?mode=tv', '_blank');
  };

  return (
    <div className="h-screen w-64 bg-slate-900 text-white flex flex-col fixed left-0 top-0 shadow-xl z-20 transition-all duration-300">
      <div className="p-6 border-b border-slate-700 flex items-center gap-3">
        <div className="bg-brand-500 p-2 rounded-lg">
          <Network size={24} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-wide">Unity Score</h1>
          <p className="text-xs text-slate-400">Gestão de Provedores</p>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-800">
           <button
              onClick={openTvMode}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-emerald-400 hover:bg-emerald-900/20 transition-colors duration-200"
            >
              <MonitorPlay size={20} />
              <span className="font-medium">Modo TV / Público</span>
            </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-700 bg-slate-900">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-slate-400">Admin</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20 hover:text-red-200 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </div>
  );
};