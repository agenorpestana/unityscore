import React, { useState } from 'react';
import { User } from '../types';
import { Network, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate network delay
    setTimeout(() => {
      
      // 1. LOGIN DO DONO DO SAAS (SUPER ADMIN GERAL)
      if (email === 'admin@saas.com' && password === 'admin') {
         const saasOwnerUser: User = {
            id: '0',
            name: 'Admin SaaS',
            email: 'admin@saas.com',
            role: 'saas_owner',
            active: true,
            permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true }
         };
         onLogin(saasOwnerUser);
         return;
      }

      // 2. LOGIN DO CLIENTE (TENANT)
      if (email === 'suporte@unityautomacoes.com.br' && password === '200616') {
        const tenantAdminUser: User = {
          id: '1',
          name: 'Suporte Unity',
          email: 'suporte@unityautomacoes.com.br',
          role: 'super_admin', // Isso aqui é admin DO TENANT
          active: true,
          permissions: {
            canManageCompany: true,
            canManageUsers: true,
            canViewScore: true
          }
        };
        onLogin(tenantAdminUser);
      } else {
        setError('Credenciais inválidas. Tente novamente.');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-brand-600 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-30 transform -skew-y-6 origin-top-left scale-150"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="bg-white p-3 rounded-xl shadow-lg mb-4">
              <Network size={32} className="text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Unity Score</h1>
            <p className="text-brand-100 text-sm mt-1">Gestão de Performance para ISPs</p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Corporativo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-gray-900 focus:border-brand-500 focus:ring-brand-500 transition-colors"
                  placeholder="seu@email.com.br"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha de Acesso</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-gray-900 focus:border-brand-500 focus:ring-brand-500 transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Acessando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>

            <div className="text-center mt-6">
              <p className="text-xs text-gray-400">
                &copy; {new Date().getFullYear()} Unity Automações. Todos os direitos reservados.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};