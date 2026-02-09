import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Settings, LogOut, Network, Trophy, FileText, MonitorPlay, X } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  userName: string;
  isOpen: boolean;           // Novo: Controle de visibilidade mobile
  onClose: () => void;       // Novo: Função para fechar no mobile
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, userName, isOpen, onClose }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
     const savedSession = localStorage.getItem('unity_user_session');
     if (savedSession) {
         try {
             setCurrentUser(JSON.parse(savedSession));
         } catch (e) {}
     }
  }, []);

  const isEmployee = currentUser?.role === 'employee';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { id: 'pontua', label: 'Pontua', icon: Trophy, visible: true },
    { id: 'reports', label: 'Relatórios', icon: FileText, visible: !isEmployee },
    { id: 'users', label: 'Usuários', icon: Users, visible: !isEmployee },
    { id: 'settings', label: 'Configurações', icon: Settings, visible: !isEmployee },
  ];

  const openTvMode = () => {
    window.open('?mode=tv', '_blank');
  };

  const handleTabClick = (id: string) => {
      setActiveTab(id);
      onClose(); // Fecha o menu ao clicar em um item no mobile
  };

  return (
    <>
      {/* Mobile Overlay (Backdrop) */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        ></div>
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col shadow-xl transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500 p-2 rounded-lg">
              <Network size={24} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide">Unity Score</h1>
              <p className="text-xs text-slate-400">Gestão de Provedores</p>
            </div>
          </div>
          {/* Botão Fechar (Mobile Apenas) */}
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {menuItems.filter(i => i.visible).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
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

          {!isEmployee && (
          <div className="pt-4 mt-4 border-t border-slate-800">
             <button
                onClick={openTvMode}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-emerald-400 hover:bg-emerald-900/20 transition-colors duration-200"
              >
                <MonitorPlay size={20} />
                <span className="font-medium">Modo TV / Público</span>
              </button>
          </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-700 bg-slate-900">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-slate-400">
                  {isEmployee ? 'Técnico' : 'Admin'}
              </p>
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
    </>
  );
};
