import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  CreditCard, 
  Users, 
  Search, 
  Plus, 
  MoreVertical, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  LogOut,
  TrendingUp,
  DollarSign
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
  
  // Estados para Modais (Simplificado para demonstração)
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  
  // Mock Data Loading (Substituir por chamadas API reais ao MySQL)
  useEffect(() => {
    // Simulando busca no banco de dados
    const mockPlans: SaaSPlan[] = [
      { id: '1', name: 'Básico', price: 99.90, maxUsers: 3, active: true },
      { id: '2', name: 'Profissional', price: 199.90, maxUsers: 10, active: true },
      { id: '3', name: 'Enterprise', price: 499.90, maxUsers: 999, active: true },
    ];

    const mockCompanies: SaaSCompany[] = [
      { id: '1', name: 'Provedor Exemplo Fibra', cnpj: '12.345.678/0001-90', emailContact: 'contato@exemplo.com', planId: '2', status: 'active', expirationDate: '2024-12-31' },
      { id: '2', name: 'Net Rápida Ltda', cnpj: '98.765.432/0001-10', emailContact: 'financeiro@netrapida.com.br', planId: '1', status: 'suspended', expirationDate: '2023-10-01' },
      { id: '3', name: 'Connect Plus', cnpj: '11.222.333/0001-00', emailContact: 'admin@connect.com', planId: '3', status: 'active', expirationDate: '2025-01-15' },
    ];

    setPlans(mockPlans);
    setCompanies(mockCompanies);
  }, []);

  const toggleCompanyStatus = (id: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, status: c.status === 'active' ? 'inactive' : 'active' };
      }
      return c;
    }));
  };

  const getPlanName = (id: string) => plans.find(p => p.id === id)?.name || 'Desconhecido';

  const calculateMRR = () => {
    return companies
      .filter(c => c.status === 'active')
      .reduce((total, company) => {
        const plan = plans.find(p => p.id === company.planId);
        return total + (plan ? plan.price : 0);
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
                 <p className="text-sm font-medium">Admin SaaS</p>
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
             <h2 className="text-2xl font-bold text-gray-800">Visão Geral do Negócio</h2>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                   <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-medium text-gray-500">MRR (Receita Mensal)</p>
                         <h3 className="text-3xl font-bold text-gray-900 mt-2">R$ {calculateMRR().toFixed(2)}</h3>
                      </div>
                      <div className="p-3 bg-green-100 text-green-600 rounded-lg"><DollarSign size={24} /></div>
                   </div>
                   <div className="mt-4 flex items-center text-sm text-green-600"><TrendingUp size={16} className="mr-1" /> +12% este mês</div>
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
                         <p className="text-sm font-medium text-gray-500">Usuários Totais</p>
                         <h3 className="text-3xl font-bold text-gray-900 mt-2">1,245</h3>
                      </div>
                      <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><Users size={24} /></div>
                   </div>
                   <div className="mt-4 text-sm text-gray-500">Em todas as instâncias</div>
                </div>
             </div>
          </div>
        )}

        {/* TAB: COMPANIES */}
        {activeTab === 'companies' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Gestão de Empresas</h2>
                <button onClick={() => setIsCompanyModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
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
                      {companies.map(company => (
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
                            <td className="px-6 py-4 text-sm text-gray-600">{new Date(company.expirationDate).toLocaleDateString('pt-BR')}</td>
                            <td className="px-6 py-4 text-right">
                               <button 
                                  onClick={() => toggleCompanyStatus(company.id)}
                                  className={`text-xs font-medium px-3 py-1 rounded border transition-colors ${company.status === 'active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                               >
                                  {company.status === 'active' ? 'Desativar' : 'Ativar'}
                               </button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
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
                       {plan.name === 'Profissional' && <div className="absolute top-0 right-0 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">MAIS VENDIDO</div>}
                       <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
                       <div className="mt-4 flex items-baseline">
                          <span className="text-3xl font-extrabold text-gray-900">R$ {plan.price.toFixed(2)}</span>
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
      
      {/* Modal Nova Empresa (Mockup Visual) */}
      {isCompanyModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
               <h3 className="text-xl font-bold text-gray-900 mb-4">Cadastrar Nova Empresa</h3>
               <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia</label><input type="text" className="w-full border p-2 rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label><input type="text" className="w-full border p-2 rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Plano</label><select className="w-full border p-2 rounded-lg"><option>Básico</option><option>Profissional</option></select></div>
                  <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200">
                     A criação real requer integração com a API Backend para criar o banco de dados do tenant.
                  </div>
               </div>
               <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => setIsCompanyModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                  <button onClick={() => setIsCompanyModalOpen(false)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Salvar</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};