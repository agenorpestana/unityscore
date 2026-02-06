import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/Login';
import { CompanySettings } from './pages/CompanySettings';
import { UserManagement } from './pages/UserManagement';
import { ScoreManagement } from './pages/ScoreManagement';
import { Reports } from './pages/Reports';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { TvDashboard } from './pages/TvDashboard';
import { AuthState, Company, User } from './types';
import { 
  RefreshCw, 
  ClipboardList, 
  CheckCircle2, 
  HardHat, 
  AlertCircle,
  ShieldAlert
} from 'lucide-react';

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    user: null
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isTvMode, setIsTvMode] = useState(false);

  // 1. Check for TV Mode in URL on mount
  // 2. Check for Persisted User Session (F5 fix)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'tv') {
        setIsTvMode(true);
    } else {
        // Tenta recuperar sessão salva
        const savedSession = localStorage.getItem('unity_user_session');
        if (savedSession) {
            try {
                const user = JSON.parse(savedSession);
                setAuth({ isAuthenticated: true, user });
            } catch (e) {
                localStorage.removeItem('unity_user_session');
            }
        }
    }
  }, []);

  // Dashboard States
  const [dashboardData, setDashboardData] = useState({
    openedToday: 0,
    closedToday: 0,
    withTechnicians: 0,
    totalOpen: 0
  });
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const handleLogin = (user: User) => {
    setAuth({
      isAuthenticated: true,
      user: user
    });
    
    // Salva sessão para persistir no F5
    localStorage.setItem('unity_user_session', JSON.stringify(user));

    // Atualiza/Cria dados da empresa no localStorage para facilitar acesso dos componentes
    if (user.companyId) {
        // Tenta manter o token existente se já houver
        const existing = localStorage.getItem('unity_company_data');
        const existingData = existing ? JSON.parse(existing) : {};
        const newData = { ...existingData, id: user.companyId };
        localStorage.setItem('unity_company_data', JSON.stringify(newData));
    }
  };

  const handleLogout = () => {
    setAuth({
      isAuthenticated: false,
      user: null
    });
    localStorage.removeItem('unity_user_session'); // Remove sessão ao sair
    setActiveTab('dashboard');
  };

  // --- API Helpers (USANDO PROXY INTERNO) ---
  const getApiConfig = useCallback(() => {
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return null;
    
    const company: Company = JSON.parse(savedCompany);
    // Para o Proxy, só precisamos do ID da empresa, o backend resolve URL e Token
    if (!company.id) return null;
    
    return {
      domain: '/api/ixc-proxy', // URL relativa ao nosso backend
      useCorsProxy: true, // Sempre usa proxy agora
      headers: {
        'Content-Type': 'application/json',
        'x-company-id': company.id // Header chave para o backend saber quem é
      }
    };
  }, []);

  const buildUrl = (config: any, path: string) => {
    // O path do IXC é anexado ao proxy
    return `${config.domain}${path}`;
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      
      if (!response.ok) {
        try {
          const jsonError = JSON.parse(text);
          throw new Error(jsonError.message || `Erro API: ${response.status}`);
        } catch {
           throw new Error(`Erro API: ${response.status} - ${text.substring(0, 50)}`);
        }
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('JSON Parse Error', text);
        return { registros: [], total: '0' }; // Fallback
      }
    } catch (err: any) {
      console.error("Fetch Error:", err);
      throw err;
    }
  };

  const fetchDashboardData = useCallback(async () => {
    const config = getApiConfig();
    if (!config) {
      setDashboardError("Configurações da empresa não carregadas. Configure na aba lateral.");
      return;
    }

    setLoadingDashboard(true);
    setDashboardError(null);
    
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const startDate = `${year}-${month}-${day}`;

    try {
      const url = buildUrl(config, '/webservice/v1/su_oss_chamado');

      const openedPromise = safeFetch(url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          qtype: 'su_oss_chamado.data_abertura',
          query: startDate,
          oper: '>=',
          rp: '1'
        })
      });

      const closedPromise = safeFetch(url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          qtype: 'su_oss_chamado.data_fechamento',
          query: startDate,
          oper: '>=',
          rp: '1'
        })
      });

      const statusList = ['A', 'EN', 'AS', 'AG']; 
      
      const statusPromises = statusList.map(status => 
        safeFetch(url, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({
            qtype: 'su_oss_chamado.status',
            query: status,
            oper: '=',
            rp: '500', 
            sortname: 'su_oss_chamado.id',
            sortorder: 'desc'
          })
        }).then(res => res.registros || [])
      );

      const [openedData, closedData, ...statusResults] = await Promise.all([
        openedPromise.catch(e => ({ total: '0', error: e })),
        closedPromise.catch(e => ({ total: '0', error: e })),
        ...statusPromises.map(p => p.catch(() => []))
      ]);

      const allFetchedOrders = statusResults.flat();
      const uniqueOrders = Array.from(new Map(allFetchedOrders.map((item: any) => [item.id, item])).values());

      const reallyOpenOrders = uniqueOrders.filter((os: any) => {
        const df = os.data_fechamento;
        const hasClosingDate = df && df !== '0000-00-00 00:00:00' && df.length > 10;
        return !hasClosingDate; 
      });

      const withTechsCount = reallyOpenOrders.filter((os: any) => 
        os.id_tecnico && 
        String(os.id_tecnico) !== '0' && 
        String(os.id_tecnico).trim() !== ''
      ).length;

      setDashboardData({
        openedToday: parseInt(openedData.total || '0'),
        closedToday: parseInt(closedData.total || '0'),
        withTechnicians: withTechsCount,
        totalOpen: reallyOpenOrders.length
      });

      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));

    } catch (e: any) {
      console.error("Dashboard sync error", e);
      setDashboardError(e.message || "Erro desconhecido ao atualizar dashboard");
    } finally {
      setLoadingDashboard(false);
    }
  }, [getApiConfig]);

  useEffect(() => {
    if (auth.isAuthenticated && activeTab === 'dashboard' && auth.user?.role !== 'saas_owner' && !isTvMode) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 60000); // 60s auto refresh
      return () => clearInterval(interval);
    }
  }, [auth.isAuthenticated, activeTab, fetchDashboardData, auth.user, isTvMode]);

  // RENDERIZAÇÃO CONDICIONAL TV MODE
  if (isTvMode) {
      // O Dashboard TV cuida da própria busca de dados baseado no localStorage
      return <TvDashboard />;
  }

  if (!auth.isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (auth.user?.role === 'saas_owner') {
    return <SuperAdminDashboard onLogout={handleLogout} currentUser={auth.user} />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout}
        userName={auth.user?.name || 'Admin'}
      />

      <div className="flex-1 ml-64 p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 mt-1">Visão geral em tempo real da operação.</p>
              </div>
              
              <div className="flex items-center gap-3">
                {lastUpdated && (
                  <span className="text-xs text-gray-400">
                    Atualizado às {lastUpdated}
                  </span>
                )}
                <button 
                  onClick={fetchDashboardData}
                  disabled={loadingDashboard}
                  className="p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:text-brand-600 transition-colors shadow-sm disabled:opacity-50"
                  title="Atualizar dados"
                >
                  <RefreshCw size={20} className={loadingDashboard ? "animate-spin" : ""} />
                </button>
              </div>
            </header>

            {dashboardError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-700">
                 <ShieldAlert className="shrink-0 mt-0.5" size={20} />
                 <div>
                   <h3 className="font-bold text-sm">Aviso de Conexão</h3>
                   <p className="text-sm">{dashboardError}</p>
                 </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ClipboardList size={64} className="text-blue-600" />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Abertas Hoje</h3>
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <ClipboardList size={20} />
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="text-4xl font-extrabold text-gray-900">
                    {loadingDashboard ? '-' : dashboardData.openedToday}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <CheckCircle2 size={64} className="text-green-600" />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Fechadas Hoje</h3>
                  <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                    <CheckCircle2 size={20} />
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="text-4xl font-extrabold text-gray-900">
                    {loadingDashboard ? '-' : dashboardData.closedToday}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <HardHat size={64} className="text-orange-600" />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Com Técnicos</h3>
                  <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                    <HardHat size={20} />
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="text-4xl font-extrabold text-gray-900">
                    {loadingDashboard ? '-' : dashboardData.withTechnicians}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <AlertCircle size={64} className="text-purple-600" />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Total em Aberto</h3>
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <AlertCircle size={20} />
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="text-4xl font-extrabold text-gray-900">
                    {loadingDashboard ? '-' : dashboardData.totalOpen}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'settings' && <CompanySettings />}
        {activeTab === 'pontua' && <ScoreManagement />}
        {activeTab === 'reports' && <Reports />}
      </div>
    </div>
  );
};

export default App;