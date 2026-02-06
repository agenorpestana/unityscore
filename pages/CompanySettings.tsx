import React, { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Key, Upload, Globe, ShieldCheck, Mail, Phone } from 'lucide-react';
import { Company } from '../types';

export const CompanySettings: React.FC = () => {
  const [company, setCompany] = useState<Company>({
    id: '1',
    name: '',
    cnpj: '',
    address: '',
    email: '',
    phone: '',
    ixcDomain: 'https://ixc.itlfibra.com', // Updated default
    ixcToken: '75:57a1a19dd8d25ff7c5519a85994926f4e76878c5f4d4a0e0596d7f32acf78ef6', // Default provided token
    useCorsProxy: true, // Default enabled for browser compatibility
    logoUrl: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    // Simulate fetching data
    const saved = localStorage.getItem('unity_company_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure useCorsProxy exists in older saved data
      setCompany({ 
        ...parsed, 
        useCorsProxy: parsed.useCorsProxy ?? true,
        email: parsed.email || '',
        phone: parsed.phone || ''
      });
    }
  }, []);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Simulate API call
    setTimeout(() => {
      localStorage.setItem('unity_company_data', JSON.stringify(company));
      setIsLoading(false);
      setMessage({ type: 'success', text: 'Dados da empresa atualizados com sucesso!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    }, 800);
  };

  return (
    <div className="max-w-4xl mx-auto">
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
                      value={company.email}
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
                      value={company.phone}
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
                    value={company.address}
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
                        value={company.ixcDomain}
                        onChange={handleChange}
                        className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="https://ixc.meuprovedor.com.br"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        URL base do seu IXC (inclua https://).
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Token de Acesso (API)</label>
                    <div className="relative">
                      <input
                        type="password"
                        name="ixcToken"
                        value={company.ixcToken}
                        onChange={handleChange}
                        className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="ID:TOKEN"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Token gerado no formato ID:TOKEN.
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <div className="flex items-center h-5 mt-1">
                        <input
                          type="checkbox"
                          name="useCorsProxy"
                          checked={company.useCorsProxy}
                          onChange={handleChange}
                          className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                          <ShieldCheck size={16} className="text-brand-600" />
                          Ativar Proxy CORS (Recomendado para Testes)
                        </span>
                        <p className="text-xs text-gray-600 mt-1">
                          Resolve o erro "Erro ao carregar" ou "Network Error" ao acessar a API do IXC diretamente pelo navegador. 
                          Desative apenas se estiver usando um servidor proxy próprio.
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
              <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
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