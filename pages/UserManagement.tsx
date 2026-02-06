import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, Shield, User as UserIcon } from 'lucide-react';
import { User, Permission } from '../types';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    password: '',
    permissions: {
      canManageCompany: false,
      canManageUsers: false,
      canViewScore: true,
    },
    active: true
  });

  useEffect(() => {
    // Mock initial data or load from storage
    const storedUsers = localStorage.getItem('unity_users');
    if (storedUsers) {
      setUsers(JSON.parse(storedUsers));
    } else {
      // Default super admin visible in list for demo
      const initialUsers: User[] = [
        {
          id: '1',
          name: 'Suporte Unity',
          email: 'suporte@unityautomacoes.com.br',
          role: 'super_admin',
          active: true,
          permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true }
        }
      ];
      setUsers(initialUsers);
      localStorage.setItem('unity_users', JSON.stringify(initialUsers));
    }
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData(user);
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
        },
        active: true,
        role: 'user'
      });
    }
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja remover este usuário?')) {
      const updated = users.filter(u => u.id !== id);
      setUsers(updated);
      localStorage.setItem('unity_users', JSON.stringify(updated));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    let updatedUsers = [...users];

    if (editingUser) {
      updatedUsers = updatedUsers.map(u => 
        u.id === editingUser.id ? { ...u, ...formData } as User : u
      );
    } else {
      const newUser: User = {
        ...formData as User,
        id: Date.now().toString(),
      };
      updatedUsers.push(newUser);
    }

    setUsers(updatedUsers);
    localStorage.setItem('unity_users', JSON.stringify(updatedUsers));
    setIsModalOpen(false);
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
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                    ${user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {user.role === 'super_admin' ? 'Super Admin' : 'Usuário'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {user.permissions.canManageCompany && <span title="Configurações" className="bg-gray-100 p-1 rounded"><Shield size={14} className="text-gray-600"/></span>}
                    {user.permissions.canManageUsers && <span title="Usuários" className="bg-gray-100 p-1 rounded"><UserIcon size={14} className="text-gray-600"/></span>}
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
      </div>

      {/* Modal for Add/Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="p-6 space-y-4">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  />
                </div>

                <div className="border-t border-gray-100 pt-4 mt-2">
                  <p className="block text-sm font-medium text-gray-700 mb-3">Permissões de Acesso</p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={formData.permissions?.canManageCompany}
                        onChange={() => togglePermission('canManageCompany')}
                        className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                      />
                      <div>
                        <span className="block text-sm font-medium text-gray-900">Configurações da Empresa</span>
                        <span className="block text-xs text-gray-500">Pode editar dados e token IXC</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={formData.permissions?.canManageUsers}
                        onChange={() => togglePermission('canManageUsers')}
                        className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                      />
                      <div>
                        <span className="block text-sm font-medium text-gray-900">Gestão de Usuários</span>
                        <span className="block text-xs text-gray-500">Pode adicionar, editar e remover usuários</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                >
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