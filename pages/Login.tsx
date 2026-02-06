import React, { useState } from 'react';
import { User } from '../types';
import { Network, Lock, Mail, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Tentar Login via API (Banco de Dados)
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
           onLogin(data.user);
           return;
        } else {
           throw new Error('Credenciais inválidas');
        }
      } else if (response.status === 404) {
         // API não encontrada (talvez rodando só frontend dev)
         throw new Error('Offline Mode');
      } else {
         // Erro 401 ou 500
         const errText = await response.json();
         throw new Error(errText.message || 'Erro no login');
      }
    } catch (err: any) {
      console.log("Fallback login local:", err.message);
      
      // FALLBACK LOCAL (Caso a API não esteja rodando ou erro de conexão)
      // Login do Dono do SaaS (Solicitado)
      if (email === 'unity@unityautomacoes.com.br' && password === '200616') {
         const saasOwnerUser: User = {
            id: '0',
            name: 'Unity Admin',
            email: 'unity@unityautomacoes.com.br',
            role: 'saas_owner',
            active: true,
            permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true }
         };
         // Pequeno delay para simular
         setTimeout(() => {
             onLogin(saasOwnerUser);
         }, 500);
         return;
      }

      // Login Antigo (Suporte)
      if (email === 'suporte@unityautomacoes.com.br' && password === '200616') {
        const tenantAdminUser: User = {
          id: '1',
          name: 'Suporte Unity',
          email: 'suporte@unityautomacoes.com.br',
          role: 'super_admin',
          active: true,
          permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true }
        };
        setTimeout(() => onLogin(tenantAdminUser), 500);
        return;
      }

      setLoading(false);
      setError('Credenciais inválidas ou erro de conexão.');
    }
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
            <p className="text-brand-100 text-sm mt-1">SaaS de Pontuação para Provedores</p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-gray-900 focus:border-brand-500 focus:ring-brand-500 transition-colors"
                  placeholder="unity@unityautomacoes.com.br"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
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
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <AlertCircle size={16} />
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
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Acessar Painel</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};