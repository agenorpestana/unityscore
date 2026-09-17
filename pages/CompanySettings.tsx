import React, { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Key, Upload, Globe, ShieldCheck, Mail, Phone, Loader2, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { Company, OpaTemplate, OpaChannel } from '../types';

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
    opaSuiteUrl: '',
    opaSuiteToken: '',
    opaSuiteCanalId: '',
    opaSuiteDefaultTemplateId: '',
    useCorsProxy: true,
    logoUrl: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Opa Suite templates e canais de WhatsApp
  const [opaTemplates, setOpaTemplates] = useState<OpaTemplate[]>([]);
  const [opaChannels, setOpaChannels] = useState<OpaChannel[]>([]);
  const [testingOpa, setTestingOpa] = useState(false);
  const [opaTestStatus, setOpaTestStatus] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    loadCompanyData();
  }, []);

  const loadCompanyData = async () => {
     setIsFetching(true);
     const savedLocal = localStorage.getItem('unity_company_data');
     let companyId = null;
     
     if (savedLocal) {
         try {
           const parsed = JSON.parse(savedLocal);
           companyId = parsed.id;
         } catch (e) {}
     }
     
     if (!companyId) {
         setIsFetching(false);
         return;
     }

     try {
         const res = await fetch(`/api/companies/${companyId}`);
         if (res.ok) {
             const data = await res.json();
             const fullData: Company = { 
                 ...data, 
                 useCorsProxy: true,
                 id: data.id.toString(),
                 opaSuiteUrl: data.opa_suite_url || data.opaSuiteUrl || '',
                 opaSuiteToken: data.opa_suite_token || data.opaSuiteToken || '',
                 opaSuiteCanalId: data.opa_suite_canal_id || data.opaSuiteCanalId || '',
                 opaSuiteDefaultTemplateId: data.opa_suite_default_template_id || data.opaSuiteDefaultTemplateId || ''
             };
             setCompany(fullData);
             localStorage.setItem('unity_company_data', JSON.stringify(fullData));

             // Se já tem URL e Token do Opa Suite configurados, busca os templates e canais WhatsApp
             if (fullData.opaSuiteUrl && fullData.opaSuiteToken) {
               fetchOpaTemplates(fullData.id);
               fetchOpaChannels(fullData.id);
             }
         }
     } catch (e) {
         console.error("Erro ao carregar empresa", e);
     } finally {
         setIsFetching(false);
     }
  };

  const fetchOpaTemplates = async (companyId: string) => {
    try {
      const res = await fetch(`/api/opasuite/templates?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        const templates = Array.isArray(data) ? data : (data.data || data.registros || []);
        setOpaTemplates(templates);
      }
    } catch (e) {
      console.warn("Não foi possível carregar templates do Opa Suite:", e);
    }
  };

  const fetchOpaChannels = async (companyId: string) => {
    try {
      const res = await fetch(`/api/opasuite/canais?companyId=${companyId}&canal=Whatsapp`);
      if (res.ok) {
        const data = await res.json();
        const channels: OpaChannel[] = Array.isArray(data) ? data : (data.data || data.registros || []);
        setOpaChannels(channels);
        if (channels.length > 0) {
          setCompany(prev => {
            if (!prev.opaSuiteCanalId) {
              const active = channels.find(c => c.status === 'A') || channels[0];
              return { ...prev, opaSuiteCanalId: active._id };
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.warn("Não foi possível carregar canais do Opa Suite:", e);
    }
  };

  const testOpaConnection = async () => {
    if (!company.opaSuiteUrl || !company.opaSuiteToken) {
      setOpaTestStatus({ success: false, text: 'Preencha a URL e o Token do Opa! Suite antes de testar.' });
      return;
    }
    setTestingOpa(true);
    setOpaTestStatus(null);
    try {
      const [resTemplates, resCanais] = await Promise.all([
        fetch(`/api/opasuite/templates?companyId=${company.id}`),
        fetch(`/api/opasuite/canais?companyId=${company.id}&canal=Whatsapp`)
      ]);

      let templateCount = 0;
      let channelCount = 0;

      if (resTemplates.ok) {
        const data = await resTemplates.json();
        const templates = Array.isArray(data) ? data : (data.data || data.registros || []);
        setOpaTemplates(templates);
        templateCount = templates.length;
      }

      if (resCanais.ok) {
        const data = await resCanais.json();
        const channels: OpaChannel[] = Array.isArray(data) ? data : (data.data || data.registros || []);
        setOpaChannels(channels);
        channelCount = channels.length;
        if (channels.length > 0 && !company.opaSuiteCanalId) {
          const active = channels.find(c => c.status === 'A') || channels[0];
          setCompany(prev => ({ ...prev, opaSuiteCanalId: active._id }));
        }
      }

      if (resTemplates.ok || resCanais.ok) {
        setOpaTestStatus({ 
          success: true, 
          text: `Conexão bem-sucedida! ${channelCount} canal(is) WhatsApp e ${templateCount} template(s) identificados no Opa! Suite.` 
        });
      } else {
        const err = await resTemplates.json().catch(() => ({}));
        setOpaTestStatus({ 
          success: false, 
          text: `Falha na conexão: ${err.error || 'Verifique se a URL e o Token estão corretos e salve as alterações.'}` 
        });
      }
    } catch (e: any) {
      setOpaTestStatus({ 
        success: false, 
        text: `Erro ao conectar com Opa! Suite: ${e.message || 'Verifique a rede ou URL'}` 
      });
    } finally {
      setTestingOpa(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCompany(prev => ({ 
      ...prev, 
      [name]: value 
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

              {/* Seção Integração Opa! Suite */}
              <div className="pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <MessageSquare className="text-brand-600" size={20} />
                    Integração Opa! Suite
                  </h3>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full border border-brand-200">
                    Envio de Templates & Notificações
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL da API do Opa! Suite</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Globe className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        name="opaSuiteUrl"
                        value={company.opaSuiteUrl || ''}
                        onChange={handleChange}
                        className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="https://chat.meuprovedor.com.br"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Endereço base do Opa! Suite onde a API está publicada (ex: https://meudominio.com.br).
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Token de Acesso da API (Bearer)</label>
                    <div className="relative">
                      <input
                        type="password"
                        name="opaSuiteToken"
                        value={company.opaSuiteToken || ''}
                        onChange={handleChange}
                        className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                        placeholder="Token de autorização gerado no Opa! Suite"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Token enviado no cabeçalho Authorization: Bearer para autenticar as solicitações.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                        <span>Canal WhatsApp Padrão</span>
                        <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={12} /> WhatsApp
                        </span>
                      </label>
                      {opaChannels.length > 0 ? (
                        <select
                          name="opaSuiteCanalId"
                          value={company.opaSuiteCanalId || ''}
                          onChange={handleChange}
                          className="block w-full rounded-lg border-emerald-300 border bg-white p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-medium text-gray-800"
                        >
                          <option value="">Selecione o canal WhatsApp...</option>
                          {opaChannels.map(c => (
                            <option key={c._id} value={c._id}>
                              {c.nome || 'Canal WhatsApp'} {c.integracao ? `(${c.integracao})` : ''} {c.status === 'A' ? '• Ativo' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="opaSuiteCanalId"
                          value={company.opaSuiteCanalId || ''}
                          onChange={handleChange}
                          className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                          placeholder="ID do Canal WhatsApp (ex: 212b435c1...)"
                        />
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Canal exclusivo do WhatsApp para envio das solicitações e notificações aos clientes.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Template Padrão</label>
                      {opaTemplates.length > 0 ? (
                        <select
                          name="opaSuiteDefaultTemplateId"
                          value={company.opaSuiteDefaultTemplateId || ''}
                          onChange={handleChange}
                          className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                        >
                          <option value="">Selecione o template padrão...</option>
                          {opaTemplates.map(t => (
                            <option key={t._id} value={t._id}>
                              {t.atalho ? `[/${t.atalho}] ` : ''}{t.texto?.substring(0, 50)}...
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="opaSuiteDefaultTemplateId"
                          value={company.opaSuiteDefaultTemplateId || ''}
                          onChange={handleChange}
                          className="block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                          placeholder="ID do Template (ex: 60a...)"
                        />
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Template selecionado por padrão ao clicar em "Enviar Solicitação".
                      </p>
                    </div>
                  </div>

                  {/* Teste de Conexão */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <span className="text-sm font-medium text-slate-800 block">Testar Comunicação com Opa! Suite</span>
                      <span className="text-xs text-slate-500">Valida se a URL e o Token conseguem consultar a API do Opa Suite.</span>
                    </div>
                    <button
                      type="button"
                      onClick={testOpaConnection}
                      disabled={testingOpa || !company.opaSuiteUrl || !company.opaSuiteToken}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-xs"
                    >
                      {testingOpa ? <Loader2 className="animate-spin" size={14} /> : <MessageSquare size={14} />}
                      Testar Conexão
                    </button>
                  </div>

                  {opaTestStatus && (
                    <div className={`p-3 rounded-lg border flex items-center gap-2 text-xs font-medium ${
                      opaTestStatus.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                    }`}>
                      {opaTestStatus.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{opaTestStatus.text}</span>
                    </div>
                  )}

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