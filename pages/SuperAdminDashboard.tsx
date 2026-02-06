import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  CreditCard, 
  Users, 
  Search, 
  Plus, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  LogOut,
  TrendingUp,
  DollarSign,
  Loader2,
  Edit,
  X
} from 'lucide-react';
import { SaaSCompany, SaaSPlan, User } from '../types';

interface SuperAdminDashboardProps {
  onLogout: () => void;
  currentUser: User;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onLogout, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'plans'>('overview');
  const [companies, setCompanies] = useState<SaaSCompany[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  
  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  
  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    cnpj: '',
    emailContact: '',
    planId: '',
    // Admin user data (only for creation)
    adminName: '',
    adminEmail: '',
    adminPassword: ''
  });

  // Carregar dados reais da API
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
        const [plansRes, companiesRes] = await Promise.all([
            fetch('/api/saas/plans'),
            fetch('/api/saas/companies')
        ]);

        if (plansRes.ok) {
            const plansData = await plansRes.json();
            setPlans(plansData);
        }

        if (companiesRes.ok) {
            const companiesData = await companiesRes.json();
            // Normalizar dados do DB (snake_case) para camelCase se necessário
            const normalizedCompanies = companiesData.map((c: any) => ({
                id: c.id,
                name: c.name,
                cnpj: c.cnpj,
                emailContact: c.email_contact,
                planId: c.plan_id,
                planName: c.plan_name,
                status: c.status,
                expirationDate: c.expiration_date
            }));
            setCompanies(normalizedCompanies);
        }
    } catch (e: any) {
        setError("Erro ao carregar dados do servidor: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleCompanyStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
        const res = await fetch(`/api/saas/companies/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            fetchData(); // Recarrega a lista
        } else {
             alert("Erro ao alterar status. Verifique o console.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    }
  };

  const handleOpenCreate = () => {
      setModalMode('create');
      setFormData({
          id: '',
          name: '',
          cnpj: '',
          emailContact: '',
          planId: plans.length > 0 ? String(plans[0].id) : '',
          adminName: '',
          adminEmail: '',
          adminPassword: ''
      });
      setIsCompanyModalOpen(true);
  };

  const handleOpenEdit = (company: SaaSCompany) => {
      setModalMode('edit');
      setFormData({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          emailContact: company.emailContact,
          planId: String(company.planId),
          adminName: '', // Não edita usuário admin aqui
          adminEmail: '',
          adminPassword: ''
      });
      setIsCompanyModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      
      try {
          let url = '/api/saas/companies';
          let method = 'POST';
          
          if (modalMode === 'edit') {
              url = `/api/saas/companies/${formData.id}`;
              method = 'PUT';
          }

          console.log("Enviando dados:", formData); // Debug

          const res = await fetch(url, {
              method: method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
          });

          const data = await res.json();

          if (!res.ok) {
              throw new Error(data.error || 'Erro ao salvar empresa');
          }

          setIsCompanyModalOpen(false);
          fetchData(); // Recarrega lista atualizada
          
      } catch (e: any) {
          alert(`Erro: ${e.message}`);
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  const getPlanName = (id: string) => {
      const p = plans.find(p => String(p.id) === String(id));
      return p ? p.name : 'Desconhecido';
  };

  const calculateMRR = () => {
    return companies
      .filter(c => c.status === 'active')
      .reduce((total, company) => {
        const plan = plans.find(p => String(p.id) === String(company.planId));
        return total + (plan ? Number(plan.price) : 0);
      }, 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex">
      {/* Sidebar do Admin SaaS */}
      <div className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-20">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-wider text-white">SaaS Admin</h1>
          <p className="text-xs text-slate-400 mt-1">Painel Mestre</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={20} /> Visão Geral
          </button>
          <button 
            onClick={() => setActiveTab('companies')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'companies' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <Building2 size={20} /> Empresas
          </button>
          <button 
            onClick={() => setActiveTab('plans')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'plans' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <CreditCard size={20} /> Planos
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700 bg-slate-950">
           <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold">A</div>
              <div>
                 <p className="text-sm font-medium">{currentUser.name}</p>
                 <p className="text-xs text-slate-400">Super User</p>
              </div>
           </div>
           <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-red-300 hover:bg-red-900/30 py-2 rounded transition-colors text-sm">
              <LogOut size={16} /> Sair
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-64 p-8">
        
        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-gray-800">Visão Geral do Negócio</h2>
                 <button onClick={fetchData} className="p-2 bg-white rounded-full shadow hover:bg-gray-50"><Loader2 size={16} className={isLoading ? "animate-spin" : ""} /></button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                   <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-medium text-gray-500">MRR (Receita Mensal)</p>
                         <h3 className="text-3xl font-bold text-gray-900 mt-2">R$ {calculateMRR().toFixed(2)}</h3>
                      </div>
                      <div className="p-3 bg-green-100 text-green-600 rounded-lg"><DollarSign size={24} /></div>
                   </div>
                   <div className="mt-4 flex items-center text-sm text-green-600"><TrendingUp size={16} className="mr-1" /> Baseado em planos ativos</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                   <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-medium text-gray-500">Empresas Ativas</p>
                         <h3 className="text-3xl font-bold text-gray-900 mt-2">{companies.filter(c => c.status === 'active').length}</h3>
                      </div>
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Building2 size={24} /></div>
                   </div>
                   <div className="mt-4 text-sm text-gray-500">Total de {companies.length} cadastradas</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                   <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-medium text-gray-500">Planos Disponíveis</p>
                         <h3 className="text-3xl font-bold text-gray-900 mt-2">{plans.length}</h3>
                      </div>
                      <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><CreditCard size={24} /></div>
                   </div>
                   <div className="mt-4 text-sm text-gray-500">Opções de assinatura</div>
                </div>
             </div>
          </div>
        )}

        {/* TAB: COMPANIES */}
        {activeTab === 'companies' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Gestão de Empresas</h2>
                <button onClick={handleOpenCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
                   <Plus size={18} /> Nova Empresa
                </button>
             </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-4">
                   <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                      <input type="text" placeholder="Buscar por nome ou CNPJ..." className="pl-10 w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                   </div>
                </div>
                {isLoading && companies.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 flex justify-center"><Loader2 className="animate-spin" /></div>
                ) : (
                <table className="w-full text-left">
                   <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                         <th className="px-6 py-4">Empresa / CNPJ</th>
                         <th className="px-6 py-4">Plano</th>
                         <th className="px-6 py-4">Contato</th>
                         <th className="px-6 py-4">Status</th>
                         <th className="px-6 py-4">Expiração</th>
                         <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                      {companies.length === 0 ? (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Nenhuma empresa cadastrada.</td></tr>
                      ) : companies.map(company => (
                         <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                               <p className="font-medium text-gray-900">{company.name}</p>
                               <p className="text-xs text-gray-500 font-mono">{company.cnpj}</p>
                            </td>
                            <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{getPlanName(company.planId)}</span></td>
                            <td className="px-6 py-4 text-sm text-gray-600">{company.emailContact}</td>
                            <td className="px-6 py-4">
                               {company.status === 'active' && <span className="inline-flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={12} /> ATIVO</span>}
                               {company.status === 'inactive' && <span className="inline-flex items-center gap-1 text-gray-500 text-xs font-bold bg-gray-100 px-2 py-1 rounded-full"><XCircle size={12} /> INATIVO</span>}
                               {company.status === 'suspended' && <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded-full"><AlertTriangle size={12} /> SUSPENSO</span>}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{company.expirationDate ? new Date(company.expirationDate).toLocaleDateString('pt-BR') : '-'}</td>
                            <td className="px-6 py-4 text-right">
                               <div className="flex justify-end gap-2">
                                <button 
                                    onClick={() => handleOpenEdit(company)}
                                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                    title="Editar Dados"
                                >
                                    <Edit size={16} />
                                </button>
                                <button 
                                    onClick={() => toggleCompanyStatus(company.id, company.status)}
                                    className={`text-xs font-medium px-3 py-1 rounded border transition-colors ${company.status === 'active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                                >
                                    {company.status === 'active' ? 'Suspender' : 'Ativar'}
                                </button>
                               </div>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
                )}
             </div>
          </div>
        )}

        {/* TAB: PLANS */}
        {activeTab === 'plans' && (
           <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-gray-800">Planos de Assinatura</h2>
                 <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
                   <Plus size={18} /> Novo Plano
                 </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {plans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col relative overflow-hidden">
                       <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
                       <div className="mt-4 flex items-baseline">
                          <span className="text-3xl font-extrabold text-gray-900">R$ {Number(plan.price).toFixed(2)}</span>
                          <span className="ml-1 text-gray-500">/mês</span>
                       </div>
                       <ul className="mt-6 space-y-4 flex-1">
                          <li className="flex items-center text-sm text-gray-600"><CheckCircle size={16} className="text-green-500 mr-2" /> Até {plan.maxUsers} usuários</li>
                          <li className="flex items-center text-sm text-gray-600"><CheckCircle size={16} className="text-green-500 mr-2" /> Integração IXC Soft</li>
                          <li className="flex items-center text-sm text-gray-600"><CheckCircle size={16} className="text-green-500 mr-2" /> Dashboards e Relatórios</li>
                       </ul>
                       <button className="mt-8 w-full py-2 border border-indigo-600 text-indigo-600 font-medium rounded-lg hover:bg-indigo-50 transition-colors">Editar Plano</button>
                    </div>
                 ))}
              </div>
           </div>
        )}

      </div>
      
      {/* Modal Nova/Editar Empresa */}
      {isCompanyModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
               <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-gray-900">{modalMode === 'create' ? 'Cadastrar Nova Empresa' : 'Editar Empresa'}</h3>
                  <button onClick={() => setIsCompanyModalOpen(false)}><X className="text-gray-500" /></button>
               </div>
               
               <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  {/* Dados da Empresa */}
                  <h4 className="text-sm font-bold text-gray-500 uppercase">Dados Corporativos</h4>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia</label><input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="Ex: Provedor X" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label><input type="text" required value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="00.000.000/0000-00" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Email de Contato</label><input type="email" value={formData.emailContact} onChange={e => setFormData({...formData, emailContact: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="financeiro@provedor.com" /></div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plano de Assinatura</label>
                      <select required value={formData.planId} onChange={e => setFormData({...formData, planId: e.target.value})} className="w-full border p-2 rounded-lg">
                          <option value="">Selecione um plano</option>
                          {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {Number(p.price).toFixed(2)}</option>)}
                      </select>
                  </div>

                  {/* Dados do Admin Inicial (Apenas na Criação) */}
                  {modalMode === 'create' && (
                      <>
                        <div className="border-t pt-4 mt-4"></div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase">Usuário Administrador Inicial</h4>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome do Admin</label><input type="text" required value={formData.adminName} onChange={e => setFormData({...formData, adminName: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="Ex: João Silva" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Email de Login</label><input type="email" required value={formData.adminEmail} onChange={e => setFormData({...formData, adminEmail: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="admin@provedor.com" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Senha Inicial</label><input type="password" required value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="******" /></div>
                      </>
                  )}

                  <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                     <button type="button" onClick={() => setIsCompanyModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 border rounded-lg">Cancelar</button>
                     <button type="submit" disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2">
                        {isLoading && <Loader2 className="animate-spin" size={16} />}
                        {modalMode === 'create' ? 'Cadastrar Empresa' : 'Salvar Alterações'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};