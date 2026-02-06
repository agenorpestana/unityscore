import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/Login';
import { CompanySettings } from './pages/CompanySettings';
import { UserManagement } from './pages/UserManagement';
import { ScoreManagement } from './pages/ScoreManagement';
import { Reports } from './pages/Reports';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
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
  };

  const handleLogout = () => {
    setAuth({
      isAuthenticated: false,
      user: null
    });
    setActiveTab('dashboard');
  };

  // --- API Helpers ---
  const getApiConfig = useCallback(() => {
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return null;
    
    const company: Company = JSON.parse(savedCompany);
    if (!company.ixcDomain || !company.ixcToken) return null;

    const domain = company.ixcDomain.trim().replace(/\/$/, '');
    const token = btoa(company.ixcToken.trim());
    
    return {
      domain,
      useCorsProxy: company.useCorsProxy !== false,
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
        'ixcsoft': 'listar'
      }
    };
  }, []);

  const buildUrl = (config: any, path: string) => {
    const targetUrl = `${config.domain}${path}`;
    if (config.useCorsProxy) {
      return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      
      if (!response.ok) {
        // Try to parse error as JSON, otherwise use text
        try {
          const jsonError = JSON.parse(text);
          throw new Error(jsonError.message || `Erro API: ${response.status}`);
        } catch {
           // Fallback for HTML errors (common with Proxy)
           throw new Error(`Erro API: ${response.status}`);
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
      setDashboardError("Configurações da API não encontradas.");
      return;
    }

    setLoadingDashboard(true);
    setDashboardError(null);
    
    // Format: YYYY-MM-DD based on LOCAL time (Brazil)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const startDate = `${year}-${month}-${day}`;

    try {
      const url = buildUrl(config, '/webservice/v1/su_oss_chamado');

      // 1. Opened Today (API Count is reliable for simple date checks)
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

      // 2. Closed Today (API Count is reliable for simple date checks)
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

      // 3. FETCH DETAILS FOR OPEN ORDERS
      // Since filters like != or LIKE might fail on some IXC versions, we fetch the common "Open" statuses 
      // and filter in memory to be 100% sure.
      const statusList = ['A', 'EN', 'AS', 'AG']; // Aberto, Encaminhado, Assumido, Agendado
      
      const statusPromises = statusList.map(status => 
        safeFetch(url, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({
            qtype: 'su_oss_chamado.status',
            query: status,
            oper: '=',
            rp: '500', // Limit to recent 500 of each status to avoid payload issues
            sortname: 'su_oss_chamado.id',
            sortorder: 'desc'
          })
        }).then(res => res.registros || [])
      );

      // Execute Promises
      const [openedData, closedData, ...statusResults] = await Promise.all([
        openedPromise.catch(e => ({ total: '0', error: e })),
        closedPromise.catch(e => ({ total: '0', error: e })),
        ...statusPromises.map(p => p.catch(() => []))
      ]);

      // Combine all fetched "potential open" orders
      const allFetchedOrders = statusResults.flat();
      
      // Deduplicate by ID (just in case an order changed status during fetch or logic overlap)
      const uniqueOrders = Array.from(new Map(allFetchedOrders.map((item: any) => [item.id, item])).values());

      // --- LOGIC: TOTAL OPEN ---
      // "mesma lógica lá da aba pontua se tiver sem data de fechamento ou com data com zeros está em aberto"
      const reallyOpenOrders = uniqueOrders.filter((os: any) => {
        const df = os.data_fechamento;
        // Check if date is null, empty, or '0000-00-00...'
        const hasClosingDate = df && df !== '0000-00-00 00:00:00' && df.length > 10;
        return !hasClosingDate; // Include if it does NOT have a valid closing date
      });

      // --- LOGIC: WITH TECHNICIANS ---
      // "se tiver alguma os associada a um técnico é considerado com o técnico"
      const withTechsCount = reallyOpenOrders.filter((os: any) => 
        os.id_tecnico && 
        String(os.id_tecnico) !== '0' && 
        String(os.id_tecnico).trim() !== ''
      ).length;

      const totalOpen = reallyOpenOrders.length;

      setDashboardData({
        openedToday: parseInt(openedData.total || '0'),
        closedToday: parseInt(closedData.total || '0'),
        withTechnicians: withTechsCount,
        totalOpen: totalOpen
      });

      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));

    } catch (e: any) {
      console.error("Dashboard sync error", e);
      setDashboardError(e.message || "Erro desconhecido ao atualizar dashboard");
    } finally {
      setLoadingDashboard(false);
    }
  }, [getApiConfig]);

  // Initial Load & Auto Refresh
  useEffect(() => {
    if (auth.isAuthenticated && activeTab === 'dashboard' && auth.user?.role !== 'saas_owner') {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 60000); // 60s auto refresh
      return () => clearInterval(interval);
    }
  }, [auth.isAuthenticated, activeTab, fetchDashboardData, auth.user]);

  if (!auth.isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // ROTA DO SUPER ADMIN (DONO DO SAAS)
  if (auth.user?.role === 'saas_owner') {
    return <SuperAdminDashboard onLogout={handleLogout} currentUser={auth.user} />;
  }

  // ROTA DO TENANT (CLIENTE DO SAAS)
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

            {/* Error Banner */}
            {dashboardError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-700">
                 <ShieldAlert className="shrink-0 mt-0.5" size={20} />
                 <div>
                   <h3 className="font-bold text-sm">Aviso de Conexão</h3>
                   <p className="text-sm">{dashboardError}</p>
                 </div>
              </div>
            )}
            
            {/* Real-time Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Card 1: Abertas Hoje */}
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
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Novas solicitações
                  </p>
                </div>
              </div>

              {/* Card 2: Fechadas Hoje */}
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
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Concluídas com sucesso
                  </p>
                </div>
              </div>

              {/* Card 3: Com Técnicos */}
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
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    Em aberto com técnico
                  </p>
                </div>
              </div>

              {/* Card 4: Total em Aberto */}
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
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    Pendentes no sistema
                  </p>
                </div>
              </div>
            </div>

            {/* Config Warning */}
            {dashboardData.totalOpen === 0 && !loadingDashboard && !dashboardError && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 text-center max-w-2xl mx-auto mt-12">
                <h3 className="text-lg font-medium text-blue-900 mb-2">Sincronização de Dados</h3>
                <p className="text-blue-700 mb-4">
                  Se os contadores estiverem zerados, certifique-se que o "Proxy CORS" está ativado na aba Configurações.
                </p>
                <button onClick={() => setActiveTab('settings')} className="text-sm font-bold text-blue-600 hover:text-blue-800 underline">
                  Ir para Configurações
                </button>
              </div>
            )}
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