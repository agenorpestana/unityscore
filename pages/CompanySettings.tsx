import React, { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Key, Upload, Globe, ShieldCheck, Mail, Phone, Loader2 } from 'lucide-react';
import { Company } from '../types';

export const CompanySettings: React.FC = () => {
  const [company, setCompany] = useState<Company>({
    id: '',
    name: '',
    cnpj: '',
    address: '',
    email: '',
    phone: '',
    ixcDomain: '',
    ixcToken: '',
    useCorsProxy: true,
    logoUrl: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    loadCompanyData();
  }, []);

  const loadCompanyData = async () => {
     setIsFetching(true);
     // Pega o ID da empresa do login salvo ou do cache antigo
     const savedLocal = localStorage.getItem('unity_company_data');
     let companyId = null;
     
     if (savedLocal) {
         const parsed = JSON.parse(savedLocal);
         companyId = parsed.id;
     }
     
     // Se não tiver ID no cache local, tenta pegar da sessão do usuário (se implementado contexto)
     // Como fallback, se não tiver ID, o usuário terá que relogar ou o sistema assume vazio
     if (!companyId) {
         setIsFetching(false);
         return;
     }

     try {
         const res = await fetch(`/api/companies/${companyId}`);
         if (res.ok) {
             const data = await res.json();
             // Mesclar com estado inicial para garantir campos
             const fullData = { 
                 ...data, 
                 useCorsProxy: true, // Força true pois agora usamos proxy interno
                 id: data.id.toString() 
             };
             setCompany(fullData);
             // Atualiza cache local para outros componentes usarem
             localStorage.setItem('unity_company_data', JSON.stringify(fullData));
         }
     } catch (e) {
         console.error("Erro ao carregar empresa", e);
     } finally {
         setIsFetching(false);
     }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setCompany(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompany(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(company)
      });

      if (!res.ok) throw new Error('Falha ao salvar');

      // Atualiza cache local
      localStorage.setItem('unity_company_data', JSON.stringify(company));
      
      setMessage({ type: 'success', text: 'Dados da empresa atualizados com sucesso!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (isFetching) {
      return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Configurações da Empresa</h2>
        <p className="text-gray-500">Gerencie os dados do provedor e integrações.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8 space-y-8">
          
          {/* Logo Section */}
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo da Empresa</label>
              <div className="relative group">
                <div className="w-40 h-40 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="Logo Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-4">
                      <Building2 className="mx-auto h-10 w-10 text-gray-400" />
                      <p className="mt-1 text-xs text-gray-500">Nenhuma logo</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-brand-600">
                  <Upload size={16} />
                  <span>Clique para alterar</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-2/3 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Provedor</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="name"
                      value={company.name}
                      onChange={handleChange}
                      className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                      placeholder="Ex: Unity Fibra"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input
                    type="text"
                    name="cnpj"
                    value={company.cnpj}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="00.000.000/0000-00"
                    required
                  />
                </div>
              </div>

              {/* New Contact Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Comercial</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={company.email || ''}
                      onChange={handleChange}
                      className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                      placeholder="contato@empresa.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="phone"
                      value={company.phone || ''}
                      onChange={handleChange}
                      className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="address"
                    value={company.address || ''}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="Rua Exemplo, 123 - Centro, Cidade - UF"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <Key className="text-yellow-500" size={20} />
                  Integração IXC Soft
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domínio do Sistema (URL)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Globe className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        name="ixcDomain"
                        value={company.ixcDomain || ''}
                        onChange={handleChange}
                        className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="https://ixc.meuprovedor.com.br"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        URL base do seu IXC (inclua https://). O acesso será feito via Proxy Seguro interno.
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Token de Acesso (API)</label>
                    <div className="relative">
                      <input
                        type="password"
                        name="ixcToken"
                        value={company.ixcToken || ''}
                        onChange={handleChange}
                        className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="ID:TOKEN"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Token gerado no formato ID:TOKEN.
                      </p>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-100 rounded-lg p-4 mt-2">
                    <label className="flex items-start gap-3">
                      <div className="flex items-center h-5 mt-1">
                        <ShieldCheck className="text-green-600" size={20} />
                      </div>
                      <div>
                        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                          Proxy Interno Ativado
                        </span>
                        <p className="text-xs text-gray-600 mt-1">
                          Para segurança e evitar erros de CORS, todas as requisições agora passam pelo nosso servidor backend.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
          <div>
            {message && (
              <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <Save size={18} />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};