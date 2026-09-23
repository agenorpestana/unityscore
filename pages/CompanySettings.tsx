import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Building2, 
  MapPin, 
  Key, 
  Upload, 
  Globe, 
  ShieldCheck, 
  Mail, 
  Phone, 
  Loader2, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Eye, 
  EyeOff, 
  Radio, 
  Wifi, 
  Layers,
  Sparkles,
  FileText,
  RotateCcw,
  Tag
} from 'lucide-react';
import { Company, WhaticketConnection, WhaticketCheckNumberResult, OsTemplatesConfig } from '../types';

export const DEFAULT_OS_TEMPLATES: Record<string, { label: string; icon: string; description: string; defaultText: string }> = {
  abertura: {
    label: 'Abertura de O.S.',
    icon: '📋',
    description: 'Enviada quando a Ordem de Serviço é criada/registrada para notificar o cliente.',
    defaultText: 'Olá, {cliente}! 👋\n\nInformamos que sua Ordem de Serviço *#{osId}* (*{servico}*) foi registrada com sucesso em nosso sistema.\n\nNossa equipe técnica já está acompanhando o caso. Qualquer dúvida, estamos à disposição!'
  },
  caminho: {
    label: 'Técnico a Caminho',
    icon: '🚗',
    description: 'Enviada avisando o cliente que a equipe técnica está em deslocamento para o endereço.',
    defaultText: 'Olá, {cliente}! 🚗💨\n\nO técnico *{tecnico}* da nossa equipe já está a caminho para realizar o atendimento da O.S. *#{osId}* no seu endereço.\n\nPor favor, certifique-se de que haverá alguém responsável no local para nos receber.'
  },
  concluida: {
    label: 'O.S. Concluída',
    icon: '✅',
    description: 'Enviada após o encerramento do chamado confirmando a conclusão dos serviços.',
    defaultText: 'Olá, {cliente}! ✅\n\nO atendimento da sua Ordem de Serviço *#{osId}* (*{servico}*) foi finalizado com sucesso pelo técnico *{tecnico}*.\n\nSeus serviços já se encontram restabelecidos. Agradecemos pela confiança e preferência! Tenha um ótimo dia!'
  },
  botoes: {
    label: 'Confirmação / Agendamento',
    icon: '💬',
    description: 'Enviada para confirmar a presença do cliente ou agendar o horário da visita.',
    defaultText: 'Olá, {cliente}! 👋\n\nConfirmamos a visita técnica referente à sua Ordem de Serviço *#{osId}* (*{servico}*).\n\nVocê confirma que haverá alguém responsável no endereço no horário agendado?'
  }
};

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
    whaticketUrl: 'https://apichat.unityautomacoes.com.br',
    whaticketToken: '',
    whaticketDefaultUserId: '',
    whaticketDefaultQueueId: '8',
    whaticketSendSignature: false,
    whaticketCloseTicket: false,
    whaticketFastSend: true,
    useCorsProxy: true,
    logoUrl: null
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Estados dos Modelos Pré-definidos de O.S.
  const [osTemplates, setOsTemplates] = useState<Record<string, string>>({
    abertura: DEFAULT_OS_TEMPLATES.abertura.defaultText,
    caminho: DEFAULT_OS_TEMPLATES.caminho.defaultText,
    concluida: DEFAULT_OS_TEMPLATES.concluida.defaultText,
    botoes: DEFAULT_OS_TEMPLATES.botoes.defaultText
  });
  const [activeTemplateTab, setActiveTemplateTab] = useState<'abertura' | 'caminho' | 'concluida' | 'botoes'>('abertura');

  // Estados da Integração Whaticket
  const [showToken, setShowToken] = useState(false);
  const [whaticketConnections, setWhaticketConnections] = useState<WhaticketConnection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; text: string } | null>(null);

  // Estados de Teste de Número e Envio
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testMessageText, setTestMessageText] = useState('Olá! Esta é uma mensagem de teste enviada via integração Whaticket do Unity Score.');
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [checkNumberResult, setCheckNumberResult] = useState<WhaticketCheckNumberResult | null>(null);
  const [checkNumberError, setCheckNumberError] = useState<string | null>(null);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [testSendResult, setTestSendResult] = useState<{ success: boolean; text: string } | null>(null);

  useEffect(() => {
    loadCompanyData();
  }, []);

  const loadCompanyData = async () => {
    setIsFetching(true);
    const savedLocal = localStorage.getItem('unity_company_data');
    let companyId = null;
    let localParsed: any = null;
    
    if (savedLocal) {
      try {
        localParsed = JSON.parse(savedLocal);
        companyId = localParsed?.id;
      } catch (e) {}
    }

    if (!companyId) {
      const sessionStr = localStorage.getItem('unity_user_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          companyId = session?.companyId || '1';
        } catch (e) {}
      }
    }
    
    if (!companyId) {
      companyId = '1';
    }

    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (res.ok) {
        const data = await res.json();
        const fullData: Company = { 
          ...data, 
          useCorsProxy: true,
          id: data.id ? data.id.toString() : String(companyId),
          ixcDomain: data.ixcDomain || localParsed?.ixcDomain || '',
          ixcToken: data.ixcToken || localParsed?.ixcToken || '',
          whaticketUrl: data.whaticketUrl || localParsed?.whaticketUrl || 'https://apichat.unityautomacoes.com.br',
          whaticketToken: data.whaticketToken || localParsed?.whaticketToken || '',
          whaticketDefaultUserId: data.whaticketDefaultUserId || localParsed?.whaticketDefaultUserId || '',
          whaticketDefaultQueueId: data.whaticketDefaultQueueId || localParsed?.whaticketDefaultQueueId || '8',
          whaticketSendSignature: data.whaticketSendSignature !== undefined ? Boolean(data.whaticketSendSignature) : Boolean(localParsed?.whaticketSendSignature),
          whaticketCloseTicket: data.whaticketCloseTicket !== undefined ? Boolean(data.whaticketCloseTicket) : Boolean(localParsed?.whaticketCloseTicket),
          whaticketFastSend: data.whaticketFastSend !== undefined ? (data.whaticketFastSend !== false) : (localParsed?.whaticketFastSend !== false)
        };
        setCompany(fullData);

        // Carrega modelos de OS customizados se existirem
        if (data.osTemplates || localParsed?.osTemplates) {
          const loadedTemplates = data.osTemplates || localParsed?.osTemplates;
          setOsTemplates(prev => ({
            ...prev,
            ...loadedTemplates
          }));
        }

        localStorage.setItem('unity_company_data', JSON.stringify({
          ...fullData,
          osTemplates: data.osTemplates || localParsed?.osTemplates || osTemplates
        }));

        if (fullData.whaticketToken) {
          fetchConnections(fullData.id, fullData.whaticketUrl, fullData.whaticketToken);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar empresa", e);
    } finally {
      setIsFetching(false);
    }
  };

  const fetchConnections = async (companyId?: string, directUrl?: string, directToken?: string) => {
    const url = directUrl || company.whaticketUrl || 'https://apichat.unityautomacoes.com.br';
    const token = directToken || company.whaticketToken;

    if (!token) {
      setConnectionStatus({ success: false, text: 'Informe o Token do Whaticket para consultar as conexões.' });
      return;
    }

    setIsLoadingConnections(true);
    setConnectionStatus(null);

    try {
      const res = await fetch('/api/whaticket/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: companyId || company.id,
          directUrl: url,
          directToken: token
        })
      });

      const data = await res.json();

      if (res.ok && data) {
        const list: WhaticketConnection[] = Array.isArray(data) 
          ? data 
          : (data.connections || data.data || []);
        
        setWhaticketConnections(list);
        if (list.length > 0) {
          setConnectionStatus({
            success: true,
            text: `Conexão validada! ${list.length} conexão(ões) encontrada(s) no Whaticket.`
          });
        } else {
          setConnectionStatus({
            success: true,
            text: 'Token válido! Porém nenhuma conexão cadastrada no Whaticket ainda.'
          });
        }
      } else {
        setConnectionStatus({
          success: false,
          text: `Erro ao consultar conexões: ${data.error || data.message || 'Token inválido ou não autorizado'}`
        });
      }
    } catch (e: any) {
      setConnectionStatus({
        success: false,
        text: `Falha na requisição: ${e.message || 'Erro de rede'}`
      });
    } finally {
      setIsLoadingConnections(false);
    }
  };

  const handleCheckTestNumber = async () => {
    const token = company.whaticketToken;
    if (!token) {
      setCheckNumberError('Informe o Token do Whaticket antes de verificar.');
      return;
    }

    const cleanNum = testPhoneNumber.replace(/\D/g, '');
    if (!cleanNum || cleanNum.length < 8) {
      setCheckNumberError('Informe um número válido com DDD (ex: 5511999998888).');
      return;
    }

    setIsCheckingNumber(true);
    setCheckNumberResult(null);
    setCheckNumberError(null);

    try {
      const res = await fetch('/api/whaticket/check-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          directUrl: company.whaticketUrl,
          directToken: token,
          number: testPhoneNumber
        })
      });

      const data = await res.json();

      if (res.ok && data && (data.existsInWhatsapp !== undefined || data.number)) {
        setCheckNumberResult(data);
      } else {
        setCheckNumberError(data.error || data.message || 'Não foi possível verificar este número no WhatsApp.');
      }
    } catch (e: any) {
      setCheckNumberError(e.message || 'Erro na requisição');
    } finally {
      setIsCheckingNumber(false);
    }
  };

  const handleSendTestMessage = async () => {
    const token = company.whaticketToken;
    if (!token) {
      setTestSendResult({ success: false, text: 'Informe o Token do Whaticket para enviar mensagens.' });
      return;
    }

    const cleanNum = testPhoneNumber.replace(/\D/g, '');
    if (!cleanNum || cleanNum.length < 8) {
      setTestSendResult({ success: false, text: 'Informe um número com DDD (ex: 5511999998888).' });
      return;
    }

    setIsSendingTestMessage(true);
    setTestSendResult(null);

    try {
      const res = await fetch('/api/whaticket/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          directUrl: company.whaticketUrl,
          directToken: token,
          number: testPhoneNumber,
          body: testMessageText,
          fastSend: company.whaticketFastSend !== false,
          userId: company.whaticketDefaultUserId || undefined,
          queueId: company.whaticketDefaultQueueId || undefined,
          sendSignature: company.whaticketSendSignature,
          closeTicket: company.whaticketCloseTicket
        })
      });

      const data = await res.json();

      if (res.ok && (data.status === 'SUCCESS' || data.id || data.message || !data.error)) {
        setTestSendResult({
          success: true,
          text: `Mensagem enviada com sucesso para ${testPhoneNumber}! Status: ${data.message || 'Entregue'}`
        });
      } else {
        setTestSendResult({
          success: false,
          text: `Erro ao enviar: ${data.error || data.message || 'Verifique o número e as configurações da conexão.'}`
        });
      }
    } catch (e: any) {
      setTestSendResult({
        success: false,
        text: `Falha no envio: ${e.message || 'Erro de comunicação'}`
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const target = e.target as HTMLInputElement;
      setCompany(prev => ({ ...prev, [name]: target.checked }));
    } else {
      setCompany(prev => ({ ...prev, [name]: value }));
    }
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
      const companyToSave = {
        ...company,
        osTemplates
      };
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyToSave)
      });

      if (!res.ok) throw new Error('Falha ao salvar');

      localStorage.setItem('unity_company_data', JSON.stringify(companyToSave));
      setMessage({ type: 'success', text: 'Dados da empresa, modelos de O.S. e integração Whaticket salvos com sucesso!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  if (isFetching) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in pb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Configurações da Empresa</h2>
        <p className="text-gray-500">Gerencie os dados do provedor, integração com o IXC Soft e o Whaticket (WhatsApp).</p>
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
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <Upload className="text-white h-6 w-6" />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">PNG, JPG até 2MB</p>
            </div>

            {/* Informações Básicas */}
            <div className="w-full md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social / Nome</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="name"
                    value={company.name}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="Nome da sua empresa"
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
                  className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  placeholder="00.000.000/0000-00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Contato</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={company.email || ''}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="contato@empresa.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone Comercial</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="phone"
                    value={company.phone || ''}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="(00) 0000-0000"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
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
                    className="pl-10 block w-full rounded-lg border-gray-300 border p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Seção Integrações */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Key className="text-brand-600" size={20} />
              Integração IXC Soft
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domínio / Host do IXC</label>
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
                    placeholder="meuprovedor.com.br"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Exemplo: meuprovedor.com.br ou 192.168.1.1 (sem https://)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token do Webservice (Bearer / Basic)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldCheck className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="ixcToken"
                    value={company.ixcToken}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-brand-500 focus:ring-brand-500 font-mono"
                    placeholder="Token do usuário de API gerado no IXC"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Token gerado em Configurações &gt; Usuários &gt; Usuários do Sistema &gt; Editar &gt; Aba Webservice</p>
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* NOVA SEÇÃO: INTEGRAÇÃO WHATICKET (WHATSAPP) */}
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="text-emerald-600" size={22} />
                  Integração Whaticket (WhatsApp)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Conexão oficial via API Whaticket para envio de mensagens, alertas de OS e notificações instantâneas aos clientes.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                <Wifi size={12} className="text-emerald-600" />
                API Chat Whaticket
              </span>
            </div>

            {/* Banner de Instrução da Documentação */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 mb-5 text-xs text-emerald-950 space-y-1.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-700" />
                Instruções Importantes de Conexão:
              </div>
              <ul className="list-disc list-inside space-y-1 text-emerald-900">
                <li>
                  Antes de enviar mensagens, cadastre o <strong>token</strong> vinculado à conexão que fará o envio. No Whaticket, acesse <strong>Conexões</strong>, edite a conexão e informe/copie o token.
                </li>
                <li>
                  O número deve conter somente <strong>Código do País + DDD + Número</strong>, sem máscara ou caracteres especiais (ex.: <code className="font-mono bg-emerald-100/80 px-1 py-0.5 rounded text-emerald-900">5511999998888</code>).
                </li>
                <li>
                  Todos os endpoints utilizam autenticação <code className="font-mono bg-emerald-100/80 px-1 py-0.5 rounded text-emerald-900">Authorization: Bearer SEU_TOKEN</code>.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              {/* URL da API Whaticket */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL da API do Whaticket</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Globe className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="whaticketUrl"
                    value={company.whaticketUrl || 'https://apichat.unityautomacoes.com.br'}
                    onChange={handleChange}
                    className="pl-10 block w-full rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-mono text-gray-800"
                    placeholder="https://apichat.unityautomacoes.com.br"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  URL base do servidor Whaticket (padrão: <span className="font-mono">https://apichat.unityautomacoes.com.br</span>).
                </p>
              </div>

              {/* Token do Whaticket */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>Token da Conexão Whaticket (Bearer)</span>
                  <span className="text-[11px] text-emerald-600 font-semibold">Obrigatório para envio</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    name="whaticketToken"
                    value={company.whaticketToken || ''}
                    onChange={handleChange}
                    className="block w-full pr-10 rounded-lg border-gray-300 border bg-gray-50 p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-mono"
                    placeholder="Cole aqui o token cadastrado na sua conexão do Whaticket"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Token gerado na aba <strong>Conexões</strong> do Whaticket ao editar a conexão do WhatsApp.
                </p>
              </div>

              {/* Modo de Envio Padrão */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <label className="block text-sm font-bold text-slate-800 mb-2">
                  Modo de Envio Padrão
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    company.whaticketFastSend !== false
                      ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100/50'
                  }`}>
                    <input
                      type="radio"
                      name="whaticketFastSend"
                      checked={company.whaticketFastSend !== false}
                      onChange={() => setCompany(prev => ({ ...prev, whaticketFastSend: true }))}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Envio Sem Ticket (Disparo Rápido)</span>
                      <span className="text-[11px] text-slate-500">
                        Dispara a mensagem diretamente no WhatsApp sem abrir ou registrar ticket. Ideal para confirmações e notificações de OS.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    company.whaticketFastSend === false
                      ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-white border-slate-200 hover:bg-slate-100/50'
                  }`}>
                    <input
                      type="radio"
                      name="whaticketFastSend"
                      checked={company.whaticketFastSend === false}
                      onChange={() => setCompany(prev => ({ ...prev, whaticketFastSend: false }))}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Envio Com Ticket (Atendimento)</span>
                      <span className="text-[11px] text-slate-500">
                        Cria e vincula um ticket de atendimento no painel do Whaticket, permitindo vincular fila e atendente.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Parâmetros Opcionais de Ticket */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID da Fila Padrão (queueId)
                  </label>
                  <input
                    type="text"
                    name="whaticketDefaultQueueId"
                    value={company.whaticketDefaultQueueId || ''}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-gray-300 border bg-white p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-mono"
                    placeholder="Ex: 1, 2 ou deixe em branco"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    ID numérico da fila do Whaticket para onde o ticket será direcionado (quando enviado com ticket).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID do Atendente Padrão (userId)
                  </label>
                  <input
                    type="text"
                    name="whaticketDefaultUserId"
                    value={company.whaticketDefaultUserId || ''}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-gray-300 border bg-white p-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-mono"
                    placeholder="Ex: 5, 12 ou deixe em branco"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    ID numérico do atendente no Whaticket. Pode ser sobrescrito pelo atendente vinculado ao usuário.
                  </p>
                </div>
              </div>

              {/* Toggles de Assinatura e Fechamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition-colors">
                  <input
                    type="checkbox"
                    name="whaticketSendSignature"
                    checked={Boolean(company.whaticketSendSignature)}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 block">Enviar Assinatura</span>
                    <span className="text-slate-500">Inclui o nome do atendente configurado no Whaticket na mensagem.</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition-colors">
                  <input
                    type="checkbox"
                    name="whaticketCloseTicket"
                    checked={Boolean(company.whaticketCloseTicket)}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 block">Fechar Ticket Automaticamente</span>
                    <span className="text-slate-500">Encerra o ticket logo após o envio (quando enviado com ticket).</span>
                  </div>
                </label>
              </div>

              {/* Painel de Conexões Ativas e Teste de Comunicação */}
              <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Wifi size={16} className="text-emerald-600" />
                      Conexões Disponíveis no Whaticket
                    </h4>
                    <p className="text-xs text-slate-500">
                      Consulta os WhatsApps conectados à sua conta via <code className="font-mono">/api/messages/connections</code>.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchConnections()}
                    disabled={isLoadingConnections || !company.whaticketToken}
                    className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {isLoadingConnections ? <Loader2 className="animate-spin" size={14} /> : <MessageSquare size={14} />}
                    <span>Consultar Conexões</span>
                  </button>
                </div>

                {connectionStatus && (
                  <div className={`p-3 rounded-lg border flex items-center gap-2 text-xs font-medium ${
                    connectionStatus.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                  }`}>
                    {connectionStatus.success ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                    <span>{connectionStatus.text}</span>
                  </div>
                )}

                {/* Lista de Conexões */}
                {whaticketConnections.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {whaticketConnections.map(conn => (
                      <div key={conn.id} className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs shadow-2xs">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{conn.name}</span>
                            {conn.isDefault && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Padrão</span>
                            )}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            {conn.number ? `+${conn.number}` : `ID: #${conn.id}`}
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          conn.status === 'CONNECTED' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {conn.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção de Teste de Envio Rápido e Verificação de Número */}
              <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Send size={15} className="text-brand-600" />
                    Validação de Número & Disparo de Teste
                  </h4>
                  <p className="text-xs text-slate-500">
                    Valide se um número possui WhatsApp ativo no Whaticket e teste o envio em tempo real.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Telefone com DDD (ex: 5511999998888)
                    </label>
                    <input
                      type="text"
                      value={testPhoneNumber}
                      onChange={e => setTestPhoneNumber(e.target.value)}
                      placeholder="5585999998888"
                      className="w-full rounded-lg border-gray-300 border p-2 text-xs bg-white font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Texto da Mensagem de Teste
                    </label>
                    <input
                      type="text"
                      value={testMessageText}
                      onChange={e => setTestMessageText(e.target.value)}
                      className="w-full rounded-lg border-gray-300 border p-2 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCheckTestNumber}
                    disabled={isCheckingNumber || !testPhoneNumber || !company.whaticketToken}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors"
                  >
                    {isCheckingNumber ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} className="text-emerald-600" />}
                    <span>Verificar WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTestMessage || !testPhoneNumber || !company.whaticketToken}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {isSendingTestMessage ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>Enviar Teste Agora</span>
                  </button>
                </div>

                {/* Retorno da Verificação de Número */}
                {checkNumberResult && (
                  <div className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                    checkNumberResult.existsInWhatsapp 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {checkNumberResult.existsInWhatsapp ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>
                      {checkNumberResult.existsInWhatsapp 
                        ? `Número verificado: Possui WhatsApp ativo (${checkNumberResult.numberFormatted || checkNumberResult.number})` 
                        : `O número ${checkNumberResult.number} não foi encontrado no WhatsApp.`}
                    </span>
                  </div>
                )}

                {checkNumberError && (
                  <div className="p-2.5 rounded-lg border bg-red-50 text-red-800 border-red-200 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={15} />
                    <span>{checkNumberError}</span>
                  </div>
                )}

                {/* Retorno do Envio de Teste */}
                {testSendResult && (
                  <div className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                    testSendResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                  }`}>
                    {testSendResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>{testSendResult.text}</span>
                  </div>
                )}
              </div>

            </div>
          </div>

          <hr className="border-gray-200" />

          {/* NOVA SEÇÃO: MODELOS PRÉ-DEFINIDOS DE O.S. (WHATSAPP) */}
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="text-emerald-600" size={22} />
                  Modelos Pré-definidos de O.S. (WhatsApp)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Personalize os modelos de mensagens disparados aos clientes. Use as variáveis dinâmicas para preenchimento automático.
                </p>
              </div>
            </div>

            {/* Abas e Editor */}
            <div className="border border-slate-200 rounded-2xl bg-white shadow-2xs overflow-hidden">
              <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5">
                {(Object.keys(DEFAULT_OS_TEMPLATES) as Array<'abertura' | 'caminho' | 'concluida' | 'botoes'>).map((key) => {
                  const item = DEFAULT_OS_TEMPLATES[key];
                  const isActive = activeTemplateTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTemplateTab(key)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-white text-emerald-900 shadow-2xs border border-slate-200 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-5 space-y-4">
                {/* Cabeçalho do Modelo Selecionado */}
                <div className="flex items-start justify-between gap-4 bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{DEFAULT_OS_TEMPLATES[activeTemplateTab].icon}</span>
                    <div>
                      <span className="font-bold block">{DEFAULT_OS_TEMPLATES[activeTemplateTab].label}</span>
                      <span className="text-emerald-800/80 text-[11px]">{DEFAULT_OS_TEMPLATES[activeTemplateTab].description}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOsTemplates(prev => ({
                        ...prev,
                        [activeTemplateTab]: DEFAULT_OS_TEMPLATES[activeTemplateTab].defaultText
                      }));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
                    title="Restaurar texto original deste modelo"
                  >
                    <RotateCcw size={12} />
                    <span>Restaurar Padrão</span>
                  </button>
                </div>

                {/* Variáveis / Tags Dinâmicas */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-slate-600 font-semibold">
                    <Tag size={13} className="text-emerald-600" />
                    <span>Inserir variáveis dinâmicas (clique para anexar ao texto):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { tag: '{cliente}', label: 'Nome do Cliente' },
                      { tag: '{osId}', label: 'Número da O.S.' },
                      { tag: '{servico}', label: 'Assunto / Serviço' },
                      { tag: '{tecnico}', label: 'Nome do Técnico' }
                    ].map(item => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => {
                          setOsTemplates(prev => ({
                            ...prev,
                            [activeTemplateTab]: (prev[activeTemplateTab] || '') + ` ${item.tag}`
                          }));
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 transition-colors"
                      >
                        <span className="font-bold text-emerald-700">{item.tag}</span>
                        <span className="text-[10px] text-slate-500 font-sans">({item.label})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editor e Preview lado a lado */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Textarea */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Texto do Modelo:
                    </label>
                    <textarea
                      rows={8}
                      value={osTemplates[activeTemplateTab] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOsTemplates(prev => ({
                          ...prev,
                          [activeTemplateTab]: val
                        }));
                      }}
                      placeholder="Digite o modelo de mensagem..."
                      className="w-full rounded-xl border-gray-300 border p-3 text-xs font-sans text-slate-800 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/40"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Suporta formatação do WhatsApp (*negrito*, _itálico_) e quebras de linha normais.
                    </p>
                  </div>

                  {/* Pré-visualização WhatsApp */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pré-visualização do Cliente no WhatsApp:
                    </label>
                    <div className="rounded-xl border border-slate-200 bg-[#EFEAE2] p-4 min-h-[180px] flex flex-col justify-end relative shadow-inner">
                      <div className="bg-white rounded-2xl rounded-tr-xs p-3 shadow-2xs border border-emerald-100 max-w-sm self-end text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {(osTemplates[activeTemplateTab] || '')
                          .replace(/\{cliente\}/gi, 'João da Silva')
                          .replace(/\{osid\}/gi, '10452')
                          .replace(/\{servico\}/gi, 'Instalação de Fibra Óptica')
                          .replace(/\{tecnico\}/gi, 'Carlos Oliveira') || (
                            <span className="text-slate-400 italic">Digite o conteúdo ao lado para visualizar...</span>
                          )}
                        <div className="text-[10px] text-slate-400 text-right mt-1.5 flex items-center justify-end gap-1">
                          <span>14:30</span>
                          <span className="text-emerald-500 font-bold">✓✓</span>
                        </div>
                      </div>
                    </div>
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
