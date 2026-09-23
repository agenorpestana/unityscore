import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Check, X, Shield, User as UserIcon, Loader2, HardHat, CheckSquare, Square, CheckCircle2, MessageSquare, RefreshCw } from 'lucide-react';
import { User, Permission, Company, SYSTEM_TABS, isTabAllowed, OpaUser } from '../types';

interface IXCEmployee {
    id: string;
    name: string;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  // IXC Employees Data
  const [ixcEmployees, setIxcEmployees] = useState<IXCEmployee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Opa! Suite Users Data
  const [opaUsers, setOpaUsers] = useState<OpaUser[]>([]);
  const [loadingOpaUsers, setLoadingOpaUsers] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    password: '',
    permissions: {
      canManageCompany: false,
      canManageUsers: false,
      canViewScore: true,
      canAssignOS: false,
      allowedTabs: ['dashboard', 'pontua', 'reports', 'tv']
    },
    active: true,
    role: 'user',
    ixcEmployeeId: '',
    opaUserId: '',
    whaticketUserId: ''
  });

  useEffect(() => {
    // Carregar ID da empresa do cache local ou sessão
    const savedCompany = localStorage.getItem('unity_company_data');
    if (savedCompany) {
        const company: Company = JSON.parse(savedCompany);
        if (company.id) {
            setCurrentCompanyId(company.id);
            fetchUsers(company.id);
            fetchOpaUsers(company.id);
        }
    }
  }, []);

  const fetchUsers = async (companyId: string) => {
      setIsLoading(true);
      try {
          const res = await fetch(`/api/users?companyId=${companyId}`);
          if (res.ok) {
              const data = await res.json();
              setUsers(data);
          }
      } catch (e) {
          console.error("Erro ao carregar usuários:", e);
      } finally {
          setIsLoading(false);
      }
  };

  const fetchOpaUsers = async (companyId?: string) => {
    const targetCompanyId = companyId || currentCompanyId;
    if (!targetCompanyId) return;

    setLoadingOpaUsers(true);
    try {
      const res = await fetch(`/api/opasuite/usuarios?companyId=${targetCompanyId}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : []);
        setOpaUsers(list);
      }
    } catch (e) {
      console.warn("Erro ao buscar usuários do Opa! Suite:", e);
    } finally {
      setLoadingOpaUsers(false);
    }
  };

  const opaUsersMap = useMemo(() => {
    const map: Record<string, string> = {};
    opaUsers.forEach(u => {
      if (u._id) map[u._id] = u.nome;
    });
    return map;
  }, [opaUsers]);

  const fetchIXCEmployees = async () => {
    if (ixcEmployees.length > 0) return; // Já carregou

    setLoadingEmployees(true);
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return;
    const company: Company = JSON.parse(savedCompany);
    
    try {
        const res = await fetch('/api/ixc-proxy/webservice/v1/funcionarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-company-id': company.id
            },
            body: JSON.stringify({
                qtype: 'funcionarios.ativo', 
                query: 'S', 
                oper: '=', 
                rp: '500', 
                sortname: 'funcionarios.funcionario', 
                sortorder: 'asc'
            })
        });

        const data = await res.json();
        if (data.registros) {
            const emps = data.registros.map((r: any) => ({
                id: r.id,
                name: r.funcionario || r.nome
            }));
            setIxcEmployees(emps);
        }
    } catch (e) {
        console.error("Erro ao buscar funcionários IXC", e);
    } finally {
        setLoadingEmployees(false);
    }
  };

  const handleOpenModal = (user?: User) => {
    fetchIXCEmployees(); // Carrega funcionários em background
    fetchOpaUsers(); // Carrega atendentes do Opa! Suite em background

    if (user) {
      setEditingUser(user);
      const existingTabs = user.permissions?.allowedTabs || 
        (user.role === 'employee' ? ['dashboard', 'pontua'] : 
         user.role === 'admin' ? ['dashboard', 'pontua', 'reports', 'users', 'settings', 'tv'] : 
         ['dashboard', 'pontua', 'reports', 'tv']);

      setFormData({ 
          ...user, 
          password: '',
          ixcEmployeeId: user.ixcEmployeeId || '',
          opaUserId: user.opaUserId || '',
          whaticketUserId: user.whaticketUserId || '',
          permissions: {
            canManageCompany: Boolean(user.permissions?.canManageCompany),
            canManageUsers: Boolean(user.permissions?.canManageUsers),
            canViewScore: user.permissions?.canViewScore !== false,
            canAssignOS: user.permissions?.canAssignOS !== undefined ? user.permissions.canAssignOS : (user.role !== 'employee'),
            allowedTabs: existingTabs
          }
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        permissions: {
          canManageCompany: false,
          canManageUsers: false,
          canViewScore: true,
          canAssignOS: true,
          allowedTabs: ['dashboard', 'pontua', 'reports', 'tv']
        },
        active: true,
        role: 'user',
        ixcEmployeeId: '',
        opaUserId: '',
        whaticketUserId: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleRoleChange = (role: 'user' | 'employee' | 'admin') => {
    let defaultTabs: string[] = ['dashboard', 'pontua'];
    let canAssign = false;
    let canManageComp = false;
    let canManageUsr = false;

    if (role === 'admin') {
      defaultTabs = ['dashboard', 'pontua', 'reports', 'users', 'settings', 'tv'];
      canAssign = true;
      canManageComp = true;
      canManageUsr = true;
    } else if (role === 'user') {
      defaultTabs = ['dashboard', 'pontua', 'reports', 'tv'];
      canAssign = true;
    } else if (role === 'employee') {
      defaultTabs = ['dashboard', 'pontua'];
      canAssign = false;
    }

    setFormData(prev => ({
      ...prev,
      role,
      permissions: {
        ...prev.permissions,
        allowedTabs: defaultTabs,
        canAssignOS: canAssign,
        canManageCompany: canManageComp,
        canManageUsers: canManageUsr
      }
    }));
  };

  const toggleAllowedTab = (tabId: string) => {
    const currentTabs = formData.permissions?.allowedTabs || [];
    const newTabs = currentTabs.includes(tabId)
      ? currentTabs.filter(t => t !== tabId)
      : [...currentTabs, tabId];
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        allowedTabs: newTabs
      }
    }));
  };

  const setAllTabs = (allowAll: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        allowedTabs: allowAll ? SYSTEM_TABS.map(t => t.id) : []
      }
    }));
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este usuário?')) {
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            if (res.ok && currentCompanyId) {
                fetchUsers(currentCompanyId);
            }
        } catch (e) {
            alert('Erro ao excluir usuário');
        }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompanyId) return;

    // Se escolheu funcionário, valida se selecionou um da lista
    if (formData.role === 'employee' && !formData.ixcEmployeeId) {
        alert("Por favor, selecione o funcionário do IXC para vincular a este usuário.");
        return;
    }

    setIsSaving(true);
    try {
        const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
        const method = editingUser ? 'PUT' : 'POST';
        const body = { ...formData, companyId: currentCompanyId };

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            setIsModalOpen(false);
            fetchUsers(currentCompanyId);

            // Se editou o próprio usuário logado, sincroniza na hora a sessão local
            const savedSession = localStorage.getItem('unity_user_session');
            if (savedSession) {
                try {
                    const sess = JSON.parse(savedSession);
                    if (editingUser && String(sess.id) === String(editingUser.id)) {
                        const updatedSession = { ...sess, ...formData, permissions: formData.permissions };
                        localStorage.setItem('unity_user_session', JSON.stringify(updatedSession));
                        window.dispatchEvent(new Event('storage'));
                    }
                } catch (e) {}
            }
        } else {
            const err = await res.json();
            alert(`Erro ao salvar: ${err.error || 'Erro desconhecido'}`);
        }
    } catch (e) {
        alert('Erro de conexão ao salvar usuário');
    } finally {
        setIsSaving(false);
    }
  };

  const togglePermission = (key: keyof Permission) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions!,
        [key]: !prev.permissions![key]
      }
    }));
  };

  const handleEmployeeSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const empId = e.target.value;
      const emp = ixcEmployees.find(emp => emp.id === empId);
      setFormData(prev => ({
          ...prev,
          ixcEmployeeId: empId,
          name: emp ? emp.name : prev.name // Auto-preenche o nome se for novo
      }));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestão de Usuários</h2>
          <p className="text-gray-500">Administre o acesso e permissões da equipe.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={20} />
          Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
            <div className="p-8 text-center flex justify-center"><Loader2 className="animate-spin text-brand-600" /></div>
        ) : (
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome / Email</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Função</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Permissões</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Nenhum usuário encontrado.</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      {user.whaticketUserId && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <MessageSquare size={11} /> Whaticket: #{user.whaticketUserId}
                          </span>
                        </div>
                      )}
                      {user.opaUserId && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <MessageSquare size={11} /> Opa: {opaUsersMap[user.opaUserId] || 'Atendente Vinculado'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                    ${user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 
                      user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 
                      user.role === 'employee' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                    {user.role === 'super_admin' ? 'Super Admin' : 
                     user.role === 'admin' ? 'Administrador' : 
                     user.role === 'employee' ? 'Funcionário (Técnico)' : 'Usuário (Gestor)'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1.5 max-w-xs">
                    {SYSTEM_TABS.map(tab => {
                      const allowed = isTabAllowed(user, tab.id);
                      if (!allowed) return null;
                      return (
                        <span 
                          key={tab.id}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                          title={tab.description}
                        >
                          {tab.label}
                        </span>
                      );
                    })}
                    {user.permissions?.canAssignOS && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Atribui OS
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {user.active ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 text-sm font-medium">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span> Inativo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleOpenModal(user)} className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                      <Edit2 size={18} />
                    </button>
                    {user.role !== 'super_admin' && (
                      <button onClick={() => handleDelete(user.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Modal for Add/Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-5">
                
                {/* Seleção de Função (Role) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Acesso</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value as any)}
                    className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 bg-white"
                  >
                    <option value="user">Usuário (Gestor de Setor)</option>
                    <option value="employee">Funcionário (Técnico / Atribuído)</option>
                    <option value="admin">Administrador Geral</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.role === 'employee' 
                        ? 'Permite ao Gestor atribuir Ordens de Serviço a este funcionário. Ao acessar "Relatórios por assunto", verá exclusivamente as OS atribuídas a ele.' 
                        : formData.role === 'user' 
                        ? 'Gestor com permissão para visualizar indicadores e atribuir chamados para os funcionários da equipe.'
                        : 'Acesso total administrativo ao sistema.'}
                  </p>
                </div>

                {/* Se for Funcionário, mostra combobox do IXC */}
                {formData.role === 'employee' && (
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                        <label className="block text-sm font-bold text-amber-800 mb-1 flex items-center gap-2">
                            <HardHat size={16} /> Vincular Funcionário IXC
                        </label>
                        {loadingEmployees ? (
                            <div className="flex items-center gap-2 text-sm text-amber-700"><Loader2 className="animate-spin" size={14} /> Carregando lista...</div>
                        ) : (
                            <select
                                value={formData.ixcEmployeeId}
                                onChange={handleEmployeeSelection}
                                required={formData.role === 'employee'}
                                className="block w-full rounded-lg border-amber-300 border p-2.5 text-sm focus:border-amber-500 focus:ring-amber-500 bg-white"
                            >
                                <option value="">Selecione o funcionário...</option>
                                {ixcEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        )}
                        <p className="text-xs text-amber-700 mt-2">
                            O sistema usará este vínculo para sincronizar o Dashboard, Pontuação e atribuições de Ordens de Serviço.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email (Login)</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha de Acesso'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder={editingUser ? '••••••••' : 'Defina a senha'}
                    className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  />
                </div>

                {/* Vínculo Whaticket (Atendente / Usuário WhatsApp) */}
                <div className="bg-emerald-50/70 p-4 rounded-lg border border-emerald-200">
                  <label className="text-sm font-bold text-emerald-900 flex items-center gap-2 mb-1.5">
                    <MessageSquare size={16} className="text-emerald-600" /> ID do Atendente / Usuário Whaticket (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={formData.whaticketUserId || ''}
                    onChange={e => setFormData({ ...formData, whaticketUserId: e.target.value })}
                    placeholder="Ex: 5 (ID numérico do atendente no Whaticket)"
                    className="block w-full rounded-lg border-emerald-300 border p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 bg-white font-mono"
                  />
                  <p className="text-xs text-emerald-700 mt-2">
                    Informe o ID do usuário no Whaticket (userId). Ao disparar mensagens com abertura de ticket, o chamado será atribuído a este atendente.
                  </p>
                </div>

                {/* Seção 1: Controle Granular de Abas do Sistema */}
                <div className="border border-gray-200 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Abas Permitidas no Sistema</h4>
                      <p className="text-xs text-gray-500">Marque as abas que este usuário poderá visualizar e acessar no menu lateral.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAllTabs(true)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-2 py-1 rounded border border-brand-200 hover:bg-brand-100 transition-colors"
                      >
                        Permitir Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllTabs(false)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        Bloquear Todas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {SYSTEM_TABS.map(tab => {
                      const isChecked = (formData.permissions?.allowedTabs || []).includes(tab.id);
                      return (
                        <div
                          key={tab.id}
                          onClick={() => toggleAllowedTab(tab.id)}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                            isChecked
                              ? 'bg-white border-brand-300 shadow-xs ring-1 ring-brand-200'
                              : 'bg-gray-50/80 border-gray-200 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleAllowedTab(tab.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <div className="flex-1">
                            <span className="block text-sm font-semibold text-gray-900">{tab.label}</span>
                            <span className="block text-xs text-gray-500 leading-relaxed">{tab.description}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Seção 2: Permissões Operacionais e Atribuição de OS */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <h4 className="text-sm font-bold text-gray-900 mb-1">Permissões de Gestão e Operação</h4>
                  <p className="text-xs text-gray-500 mb-3">Controle de atribuição de ordens de serviço e privilégios administrativos.</p>
                  
                  <div className="space-y-2.5">
                    <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input 
                        type="checkbox"
                        checked={formData.permissions?.canAssignOS}
                        onChange={() => togglePermission('canAssignOS')}
                        className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                      />
                      <div>
                        <span className="block text-sm font-semibold text-gray-900">Atribuir Ordens de Serviço a Funcionários</span>
                        <span className="block text-xs text-gray-500">
                          Habilita a coluna Ações nos relatórios para que o Gestor/Admin vincule ordens de serviço diretamente aos funcionários.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input 
                        type="checkbox"
                        checked={formData.permissions?.canManageCompany}
                        onChange={() => togglePermission('canManageCompany')}
                        className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                      />
                      <div>
                        <span className="block text-sm font-semibold text-gray-900">Gerenciar Configurações da Empresa</span>
                        <span className="block text-xs text-gray-500">Pode alterar dados cadastrais, tokens de integração IXC Soft e Opa! Suite.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input 
                        type="checkbox"
                        checked={formData.permissions?.canManageUsers}
                        onChange={() => togglePermission('canManageUsers')}
                        className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                      />
                      <div>
                        <span className="block text-sm font-semibold text-gray-900">Gerenciar Usuários e Permissões</span>
                        <span className="block text-xs text-gray-500">Pode cadastrar, editar permissões de abas e remover usuários da empresa.</span>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="animate-spin" size={16} />}
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
