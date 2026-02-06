import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Edit2, Save, X, RefreshCw, Trophy, Loader2, ShieldAlert, ChevronLeft, ChevronRight, Phone, MapPin, User, FileText, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Technician, Subject, ServiceOrder, ScoreRule, Company } from '../types';

interface EmployeeMapItem {
  id: string;
  name: string;
}

type DetailedServiceOrder = ServiceOrder & { 
  city?: string; 
  phone?: string; 
  technicianGroup?: string;
  description?: string;
  solution?: string;
};

export const ScoreManagement: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'technicians' | 'rules'>('technicians');
  
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [serviceOrders, setServiceOrders] = useState<(ServiceOrder & { technicianGroup?: string })[]>([]);
  const [clientCache, setClientCache] = useState<Record<string, string>>({});
  
  const [employeesMap, setEmployeesMap] = useState<Map<string, EmployeeMapItem>>(new Map());
  const [sectorsMap, setSectorsMap] = useState<Map<string, string>>(new Map());

  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingClients, setIsResolvingClients] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const [viewingOrder, setViewingOrder] = useState<DetailedServiceOrder | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});

  const getTodayLocal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [filters, setFilters] = useState({
    startDate: getTodayLocal(),
    endDate: getTodayLocal(),
    technicianId: '',
    subjectId: '',
    dateType: 'closing' as 'opening' | 'closing'
  });

  const [editingRule, setEditingRule] = useState<{ subject: Subject, rule: ScoreRule } | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');

  const formatDateBR = (dateString: string | undefined | null) => {
    if (!dateString || dateString === '0000-00-00 00:00:00' || dateString === '-') return '-';
    if (dateString === 'EM ABERTO') return 'EM ABERTO';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateString; }
  };

  const getApiConfig = useCallback(() => {
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return null;
    const company: Company = JSON.parse(savedCompany);
    if (!company.ixcDomain || !company.ixcToken) return null;
    const domain = company.ixcDomain.trim().replace(/\/$/, '');
    const token = btoa(company.ixcToken.trim());
    return {
      domain,
      useCorsProxy: company.useCorsProxy !== false,
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json', 'ixcsoft': 'listar' }
    };
  }, []);

  const buildUrl = (config: any, path: string) => {
    const targetUrl = `${config.domain}${path}`;
    return config.useCorsProxy ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (!response.ok) {
        try { const jsonError = JSON.parse(text); throw new Error(jsonError.message || `Erro API: ${response.status}`); } 
        catch { throw new Error(`Erro API (${response.status}): ${text.substring(0, 50)}...`); }
      }
      try { return JSON.parse(text); } 
      catch (e) { if (text.trim().startsWith('<')) throw new Error('API retornou HTML. Verifique Proxy.'); throw new Error('JSON inválido.'); }
    } catch (err: any) { throw err; }
  };

  const fetchRulesFromBackend = async () => {
     try {
         // Tenta buscar da API (MySQL)
         const res = await fetch('/api/score-rules');
         if (res.ok) {
             const dbRules = await res.json();
             // Mescla com o local para garantir que regras novas do IXC apareçam
             return dbRules;
         }
     } catch (e) {
         console.log("Backend offline, usando localStorage");
     }
     // Fallback
     const savedRules = localStorage.getItem('unity_score_rules');
     return savedRules ? JSON.parse(savedRules) : {};
  };

  const fetchStaffData = async () => {
    const config = getApiConfig();
    if (!config) return;

    try {
      const [sectorsData, empData] = await Promise.all([
        safeFetch(buildUrl(config, '/webservice/v1/empresa_setor'), { method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'empresa_setor.id', query: '0', oper: '>', rp: '1000', sortname: 'empresa_setor.setor', sortorder: 'asc' }) }).catch(() => ({ registros: [] })),
        safeFetch(buildUrl(config, '/webservice/v1/funcionarios'), { method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'funcionarios.id', query: '0', oper: '>', rp: '10000', sortname: 'funcionarios.funcionario', sortorder: 'asc' }) }).catch(() => ({ registros: [] }))
      ]);

      const newSectorsMap = new Map<string, string>();
      if (sectorsData.registros) {
        sectorsData.registros.forEach((s: any) => { 
          if (s.id && s.setor) newSectorsMap.set(String(s.id), s.setor); 
        });
      }
      setSectorsMap(newSectorsMap);

      const newEmployeesMap = new Map<string, EmployeeMapItem>();
      const combinedTechList: Technician[] = [];

      if (empData.registros) {
        empData.registros.forEach((reg: any) => {
          const name = reg.funcionario || reg.nome || `Funcionario ${reg.id}`;
          newEmployeesMap.set(String(reg.id), { id: String(reg.id), name: name });
          if (reg.ativo !== 'N') {
            combinedTechList.push({ id: String(reg.id), name: name });
          }
        });
      }
      setEmployeesMap(newEmployeesMap);
      
      combinedTechList.sort((a, b) => a.name.localeCompare(b.name));
      setTechnicians(combinedTechList);

    } catch (err: any) {
      console.error(err);
      setError(`Erro ao carregar dados: ${err.message}`);
    }
  };

  const fetchSubjects = async () => {
    const config = getApiConfig();
    if (!config) return;
    try {
      const data = await safeFetch(buildUrl(config, '/webservice/v1/su_oss_assunto'), {
        method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'su_oss_assunto.ativo', query: 'S', oper: '=', rp: '1000', sortname: 'su_oss_assunto.assunto', sortorder: 'asc' })
      });
      
      // Carregar regras atuais (DB ou Local)
      const currentRules = await fetchRulesFromBackend();

      if (data.registros) {
        const subs: Subject[] = data.registros.map((reg: any) => ({ id: reg.id, title: reg.assunto }));
        setSubjects(subs);
        
        // Sincronizar assuntos do IXC com regras existentes
        let hasChanges = false;
        subs.forEach(sub => {
          if (!currentRules[sub.id]) { 
              currentRules[sub.id] = { subjectId: sub.id, points: 0, type: 'both' }; 
              hasChanges = true; 
          }
        });
        
        setScoreRules(currentRules);
        if (hasChanges) {
           localStorage.setItem('unity_score_rules', JSON.stringify(currentRules));
        }
      }
    } catch (err: any) { console.warn(`Erro assuntos: ${err.message}`); }
  };

  const resolveClientNames = async (orders: ServiceOrder[]) => {
    const config = getApiConfig();
    if (!config) return;
    const uniqueClientIds = Array.from(new Set(orders.map(o => o.clientId))).filter(id => id && !clientCache[id]);
    if (uniqueClientIds.length === 0) return;
    setIsResolvingClients(true);
    const newCache = { ...clientCache };
    const idsToFetch = uniqueClientIds.slice(0, 20); 
    try {
      await Promise.all(idsToFetch.map(async (clientId) => {
        try {
          const data = await safeFetch(buildUrl(config, '/webservice/v1/cliente'), {
            method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'cliente.id', query: clientId, oper: '=', rp: '1' })
          });
          if (data.registros?.[0]) {
            const client = data.registros[0];
            newCache[clientId] = client.razao || client.nome_social || client.nome || `Cliente ${clientId}`;
          } else { newCache[clientId] = `Cliente #${clientId}`; }
        } catch (e) { newCache[clientId] = `Cliente #${clientId}`; }
      }));
      setClientCache(prev => ({ ...prev, ...newCache }));
    } finally { setIsResolvingClients(false); }
  };

  const fetchServiceOrders = async () => {
    const config = getApiConfig();
    if (!config) { setError('Configure o Domínio e Token.'); return; }
    setIsLoading(true); setError(null); setCurrentPage(1);

    try {
      const url = buildUrl(config, '/webservice/v1/su_oss_chamado');
      const dateField = filters.dateType === 'closing' ? 'su_oss_chamado.data_fechamento' : 'su_oss_chamado.data_abertura';
      
      let allDateRegistros: any[] = [];
      let page = 1;
      let fetchedAll = false;
      const MAX_PAGES = 20; 
      const PAGE_SIZE = 500;

      while (!fetchedAll && page <= MAX_PAGES) {
        const dateData = await safeFetch(url, {
          method: 'POST', 
          headers: config.headers, 
          body: JSON.stringify({ 
            qtype: dateField, 
            query: filters.startDate, 
            oper: '>=', 
            rp: String(PAGE_SIZE), 
            page: String(page),
            sortname: dateField, 
            sortorder: 'desc' 
          })
        });

        const records = dateData.registros || [];
        allDateRegistros = [...allDateRegistros, ...records];

        if (records.length < PAGE_SIZE) {
          fetchedAll = true;
        } else {
          page++;
        }
      }

      const activePromise = filters.dateType === 'closing' ? safeFetch(url, {
        method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'su_oss_chamado.status', query: 'EN', oper: '=', rp: '200', sortname: 'su_oss_chamado.id', sortorder: 'desc' })
      }) : Promise.resolve({ registros: [] });

      const activeData = await activePromise.catch(() => ({ registros: [] }));
      
      const allRecords = [...allDateRegistros, ...(activeData.registros || [])];
      const uniqueRecordsMap = new Map();
      allRecords.forEach((item: any) => uniqueRecordsMap.set(item.id, item));
      let uniqueOrders = Array.from(uniqueRecordsMap.values());

      if (filters.dateType === 'closing') {
        uniqueOrders = uniqueOrders.filter((reg: any) => reg.status === 'F' || reg.status === 'EN');
      }

      const orders: (ServiceOrder & { technicianGroup?: string })[] = uniqueOrders.map((reg: any) => {
        let techName = 'OS SEM TÉCNICO';
        let sectorName = 'Sem Setor'; 
        const techId = String(reg.id_tecnico); 

        if (techId && techId !== '0') {
           const employee = employeesMap.get(techId);
           techName = employee ? employee.name : (reg.tecnico || `Técnico #${techId}`);
        } else if (reg.tecnico) {
           techName = reg.tecnico;
        }

        if (reg.setor && reg.setor !== '0') {
           const sId = String(reg.setor);
           if (sectorsMap.has(sId)) {
               sectorName = sectorsMap.get(sId)!;
           } else {
               sectorName = `Setor #${sId}`;
           }
        }
        
        const sub = subjects.find(s => s.id === reg.id_assunto);
        const rawFinal = reg.data_final;
        const rawFechamento = reg.data_fechamento;
        let closingDate = 'EM ABERTO';
        let reopeningDate = '-';

        if (rawFechamento && rawFechamento !== '0000-00-00 00:00:00') {
           closingDate = rawFechamento;
           if (rawFinal && rawFinal !== '0000-00-00 00:00:00') {
               const diffInSeconds = (new Date(rawFechamento).getTime() - new Date(rawFinal).getTime()) / 1000;
               if (diffInSeconds > 300) { closingDate = rawFinal; reopeningDate = rawFechamento; }
           }
        }

        let statusText: 'Aberto' | 'Fechado' | 'Em Andamento' = 'Em Andamento';
        if (reg.status === 'F') statusText = 'Fechado';
        else if (reg.status === 'A') statusText = 'Aberto';

        return {
          id: reg.id,
          technicianId: reg.id_tecnico,
          technicianName: techName,
          technicianGroup: sectorName,
          clientId: reg.id_cliente,
          clientName: clientCache[reg.id_cliente] || `Carregando...`, 
          subjectId: reg.id_assunto,
          subjectName: sub ? sub.title : `Assunto #${reg.id_assunto}`,
          openingDate: reg.data_abertura,
          closingDate: closingDate,
          reopeningDate: reopeningDate,
          status: statusText
        };
      });

      const filtered = orders.filter(order => {
          const matchTech = filters.technicianId ? order.technicianId === filters.technicianId : true;
          const matchSub = filters.subjectId ? order.subjectId === filters.subjectId : true;
          let relevantDate = filters.dateType === 'closing' && order.closingDate !== 'EM ABERTO' ? order.closingDate.split(' ')[0] : order.openingDate.split(' ')[0];
          if (filters.dateType === 'closing' && order.closingDate === 'EM ABERTO') return matchTech && matchSub;
          const matchDate = relevantDate >= filters.startDate && relevantDate <= filters.endDate;
          return matchTech && matchSub && matchDate;
      });

      filtered.sort((a, b) => {
        const dateA = filters.dateType === 'closing' && a.closingDate !== 'EM ABERTO' ? a.closingDate : a.openingDate;
        const dateB = filters.dateType === 'closing' && b.closingDate !== 'EM ABERTO' ? b.closingDate : b.openingDate;
        return dateB.localeCompare(dateA);
      });

      setServiceOrders(filtered);
    } catch (err: any) {
      console.error(err);
      setError(`Erro ao buscar dados: ${err.message}`);
    } finally { setIsLoading(false); }
  };

  const handleViewDetails = async (order: ServiceOrder) => {
    setViewingOrder(order);
    setIsLoadingDetails(true);

    const config = getApiConfig();
    if (!config) { setIsLoadingDetails(false); return; }

    try {
        const url = buildUrl(config, '/webservice/v1/su_oss_chamado');
        const res = await safeFetch(url, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                qtype: 'su_oss_chamado.id',
                query: order.id,
                oper: '=',
                rp: '1'
            })
        });

        if (res.registros && res.registros.length > 0) {
            const fullOrder = res.registros[0];
            setViewingOrder(prev => prev && prev.id === order.id ? {
                ...prev,
                description: fullOrder.mensagem,           
                solution: fullOrder.mensagem_resposta      
            } : prev);
        }
    } catch (e) {
        console.error("Erro ao buscar detalhes da OS", e);
    } finally {
        setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchStaffData();
    fetchSubjects();
  }, [getApiConfig]);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRule) {
      const updatedRules = { ...scoreRules, [editingRule.subject.id]: editingRule.rule };
      setScoreRules(updatedRules);
      
      // Salvar Local
      localStorage.setItem('unity_score_rules', JSON.stringify(updatedRules));
      
      // Salvar na API (Backend MySQL)
      try {
          await fetch('/api/score-rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  subjectId: editingRule.rule.subjectId,
                  points: editingRule.rule.points,
                  type: editingRule.rule.type
                  // companyId é tratado no backend (ou adicionado aqui se tiver multi-tenant no frontend)
              })
          });
      } catch(e) {
          console.error("Falha ao salvar regra no banco:", e);
      }

      setEditingRule(null);
    }
  };

  const getPointsForOrder = (order: ServiceOrder) => {
    if (order.closingDate === 'EM ABERTO') return 0;
    let points = scoreRules[order.subjectId]?.points || 0;

    if (order.reopeningDate && order.reopeningDate !== '-') {
        const dateOriginal = new Date(order.closingDate); 
        const dateReopening = new Date(order.reopeningDate); 
        
        if (!isNaN(dateOriginal.getTime()) && !isNaN(dateReopening.getTime())) {
            const diffTime = Math.abs(dateReopening.getTime() - dateOriginal.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 30) {
                points = -Math.abs(points);
            }
        }
    }
    return points;
  };

  const totalPoints = serviceOrders.reduce((sum, order) => sum + getPointsForOrder(order), 0);
  const totalPages = Math.ceil(serviceOrders.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentOrders = serviceOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => { if (currentOrders.length > 0) resolveClientNames(currentOrders); }, [currentPage, serviceOrders]);
  const handlePageChange = (newPage: number) => { if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage); };
  const filteredSubjects = subjects.filter(sub => sub.title.toLowerCase().includes(ruleSearch.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Trophy className="text-yellow-500" /> Gestão de Pontuação</h2>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setActiveSubTab('technicians')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSubTab === 'technicians' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Pontuação Técnicos</button>
          <button onClick={() => setActiveSubTab('rules')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSubTab === 'rules' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Tabela de Pontos</button>
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3"><ShieldAlert size={20} className="mt-0.5 shrink-0" /><div><p className="font-bold">Erro de Comunicação</p><p className="text-sm">{error}</p></div></div>}
      
      {activeSubTab === 'technicians' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4 text-gray-700 font-medium"><Filter size={18} /> Filtros de Busca</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Data de</label><select value={filters.dateType} onChange={e => setFilters({...filters, dateType: e.target.value as 'opening' | 'closing'})} className="w-full rounded-lg border-gray-300 border p-2 text-sm bg-gray-50 font-medium text-brand-700"><option value="closing">Fechamento</option><option value="opening">Abertura</option></select></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Data Início</label><input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Data Fim</label><input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Técnico (Funcionário)</label><select value={filters.technicianId} onChange={e => setFilters({...filters, technicianId: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">Todos</option>{technicians.map((tech, idx) => (<option key={`${tech.id}-${idx}`} value={tech.id}>{tech.name}</option>))}</select></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Assunto (OS)</label><select value={filters.subjectId} onChange={e => setFilters({...filters, subjectId: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">Todos os Assuntos</option>{subjects.map(sub => (<option key={sub.id} value={sub.id}>{sub.title}</option>))}</select></div>
              <div className="flex items-end"><button onClick={fetchServiceOrders} disabled={isLoading} className="w-full bg-brand-600 hover:bg-brand-700 text-white p-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-70">{isLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />} Filtrar</button></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-3"><h3 className="font-semibold text-gray-700">Ordens de Serviço</h3>{isResolvingClients && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full animate-pulse flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Buscando clientes...</span>}</div>
              <div className="text-sm font-medium text-gray-600 bg-white px-3 py-1 rounded border border-gray-200 shadow-sm">Total de Pontos (Filtro): <span className={`font-bold ml-1 ${totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>{totalPoints}</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider"><tr><th className="px-6 py-3">Técnico / Setor</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Data Abertura</th><th className="px-6 py-3">Data Fechamento</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Assunto</th><th className="px-6 py-3 text-center">Pontos</th><th className="px-6 py-3 text-right">Ações</th></tr></thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {currentOrders.length > 0 ? (
                    currentOrders.map(order => {
                      const points = getPointsForOrder(order);
                      return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                           <div>{order.technicianName}</div>
                           {order.technicianGroup ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 mt-1 border border-gray-200">{order.technicianGroup}</span> : <span className="text-[10px] text-red-400 italic block mt-1">Setor não encontrado</span>}
                           {order.technicianId && order.technicianId !== '0' && <span className="block text-[10px] text-gray-400 font-mono mt-0.5">ID: {order.technicianId}</span>}
                        </td>
                         <td className="px-6 py-4"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${order.status === 'Fechado' ? 'bg-green-100 text-green-800' : order.status === 'Em Andamento' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{order.status}</span></td>
                        <td className="px-6 py-4 text-gray-500">{formatDateBR(order.openingDate)}</td>
                        <td className="px-6 py-4 text-gray-500">{order.closingDate === 'EM ABERTO' ? <span className="text-gray-400">-</span> : formatDateBR(order.closingDate)}</td>
                        <td className="px-6 py-4 text-gray-500">{clientCache[order.clientId] || order.clientName}</td>
                        <td className="px-6 py-4"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">{order.subjectName}</span></td>
                        <td className="px-6 py-4 text-center"><span className={`font-bold ${points > 0 ? 'text-brand-600' : points < 0 ? 'text-red-600' : 'text-gray-300'}`}>{points}</span></td>
                        <td className="px-6 py-4 text-right"><button onClick={() => handleViewDetails(order)} className="text-brand-600 hover:text-brand-800 text-xs font-medium hover:underline">Ver Detalhes</button></td>
                      </tr>
                    )})
                  ) : (<tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500">{isLoading ? 'Carregando...' : 'Nenhuma ordem de serviço encontrada.'}</td></tr>)}
                </tbody>
              </table>
            </div>
            {serviceOrders.length > 0 && (
              <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden"><button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Anterior</button><button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="ml-3 px-4 py-2 border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Próxima</button></div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"><p className="text-sm text-gray-700">Mostrando <span className="font-medium">{Math.min(startIndex + 1, serviceOrders.length)}</span> até <span className="font-medium">{Math.min(startIndex + ITEMS_PER_PAGE, serviceOrders.length)}</span> de <span className="font-medium">{serviceOrders.length}</span> resultados</p><nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"><button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button><span className="px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Página {currentPage} de {totalPages}</span><button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button></nav></div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {activeSubTab === 'rules' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
               <div><h3 className="text-lg font-bold text-gray-800">Assuntos e Pontuação</h3><p className="text-sm text-gray-500">Defina os pontos por assunto.</p></div>
               <div className="relative w-full md:w-64"><Search className="absolute left-3 top-2.5 text-gray-400" size={18} /><input type="text" placeholder="Buscar assunto..." value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} className="pl-10 w-full rounded-lg border-gray-300 border p-2 text-sm" /></div>
             </div>
             <div className="overflow-x-auto border rounded-lg border-gray-200">
               <table className="w-full text-left"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Assunto</th><th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pontos</th><th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Tipo</th><th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Ação</th></tr></thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                     {filteredSubjects.length > 0 ? (filteredSubjects.map(sub => { const rule = scoreRules[sub.id] || { subjectId: sub.id, points: 0, type: 'both' }; return (
                           <tr key={sub.id} className="hover:bg-gray-50"><td className="px-6 py-4 font-medium text-gray-900">{sub.title}</td><td className="px-6 py-4 text-center">{rule.points > 0 ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{rule.points} pts</span> : <span className="text-gray-400">-</span>}</td><td className="px-6 py-4 text-center text-gray-600 capitalize">{rule.type === 'both' ? 'Ambos' : rule.type === 'internal' ? 'Interno' : 'Externo'}</td><td className="px-6 py-4 text-right"><button onClick={() => setEditingRule({ subject: sub, rule })} className="text-brand-600 hover:text-brand-800 p-2 hover:bg-brand-50 rounded-lg transition-colors"><Edit2 size={16} /></button></td></tr>
                         ); })) : (<tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhum assunto encontrado.</td></tr>)}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Pontos */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50"><h3 className="text-lg font-bold text-gray-900">Editar Pontuação</h3><button onClick={() => setEditingRule(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
            <form onSubmit={handleSaveRule}><div className="p-6 space-y-5"><div><label className="block text-sm font-medium text-gray-500 mb-1">Assunto</label><div className="text-gray-900 font-medium text-lg">{editingRule.subject.title}</div></div><div><label className="block text-sm font-medium text-gray-700 mb-2">Quantidade de Pontos</label><input type="number" min="0" step="0.5" required value={editingRule.rule.points} onChange={e => setEditingRule({ ...editingRule, rule: { ...editingRule.rule, points: parseFloat(e.target.value) } })} className="block w-full rounded-lg border-gray-300 border p-3 text-lg font-semibold text-brand-600 focus:border-brand-500 focus:ring-brand-500" /></div><div><label className="block text-sm font-medium text-gray-700 mb-3">Tipo de Pontuação</label><div className="grid grid-cols-3 gap-3"><label className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${editingRule.rule.type === 'internal' ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'}`}><input type="radio" name="scoreType" className="sr-only" checked={editingRule.rule.type === 'internal'} onChange={() => setEditingRule({ ...editingRule, rule: { ...editingRule.rule, type: 'internal' } })} /><span className="text-sm font-medium">Interno</span></label><label className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${editingRule.rule.type === 'external' ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'}`}><input type="radio" name="scoreType" className="sr-only" checked={editingRule.rule.type === 'external'} onChange={() => setEditingRule({ ...editingRule, rule: { ...editingRule.rule, type: 'external' } })} /><span className="text-sm font-medium">Externo</span></label><label className={`cursor-pointer border rounded-lg p-3 text-center transition-all ${editingRule.rule.type === 'both' ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'}`}><input type="radio" name="scoreType" className="sr-only" checked={editingRule.rule.type === 'both'} onChange={() => setEditingRule({ ...editingRule, rule: { ...editingRule.rule, type: 'both' } })} /><span className="text-sm font-medium">Ambos</span></label></div></div></div><div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3"><button type="button" onClick={() => setEditingRule(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button><button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center gap-2"><Save size={16} /> Salvar</button></div></form>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da OS */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 sticky top-0">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileText className="text-brand-600" /> Detalhes da OS #{viewingOrder.id}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${viewingOrder.status === 'Fechado' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{viewingOrder.status}</span>
              </div>
              <button onClick={() => setViewingOrder(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Técnico Responsável</h4>
                    <div className="flex items-center gap-2">
                       <User size={18} className="text-gray-400" />
                       <span className="font-medium text-gray-900">{viewingOrder.technicianName}</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Cliente</h4>
                    <div className="flex items-center gap-2">
                       <User size={18} className="text-gray-400" />
                       <span className="font-medium text-gray-900">{clientCache[viewingOrder.clientId] || viewingOrder.clientName || 'Cliente não identificado'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Assunto</h4>
                    <div className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm text-gray-800 border border-gray-200 inline-block">
                      {viewingOrder.subjectName}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Pontuação Calculada</h4>
                    <div className={`text-2xl font-bold flex items-center gap-1 ${getPointsForOrder(viewingOrder) < 0 ? 'text-red-600' : 'text-brand-600'}`}>
                      {getPointsForOrder(viewingOrder)} <span className="text-sm font-normal text-gray-500">pontos</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1"><Clock size={14} /> Abertura</h4>
                  <p className="text-sm font-mono text-gray-700">{formatDateBR(viewingOrder.openingDate)}</p>
                </div>
                <div className={`p-3 rounded-lg border border-gray-100 ${viewingOrder.closingDate !== 'EM ABERTO' ? 'bg-green-50' : 'bg-gray-50'}`}>
                   <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1"><CheckCircle size={14} /> Fechamento</h4>
                   <p className="text-sm font-mono text-gray-700">{formatDateBR(viewingOrder.closingDate)}</p>
                </div>
              </div>
              
              {viewingOrder.reopeningDate && viewingOrder.reopeningDate !== '-' && (
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg flex items-start gap-3">
                   <AlertCircle className="text-orange-600 mt-0.5" size={18} />
                   <div>
                     <h4 className="text-sm font-bold text-orange-800">Atenção: Reabertura Detectada</h4>
                     <p className="text-xs text-orange-700 mt-1">Esta ordem foi reaberta em {formatDateBR(viewingOrder.reopeningDate)}. 
                     {getPointsForOrder(viewingOrder) < 0 && <span className="font-bold ml-1 text-red-600">Pontuação negativada por reincidência (30 dias).</span>}
                     </p>
                   </div>
                </div>
              )}

              {/* Seção de Detalhes Carregados (Mensagem e Solução) */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                 {isLoadingDetails ? (
                    <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                       <Loader2 className="animate-spin" size={20} /> Carregando detalhes da mensagem...
                    </div>
                 ) : (
                    <>
                       <div>
                          <h4 className="text-sm font-bold text-gray-900 mb-2">Descrição (Mensagem)</h4>
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                             {viewingOrder.description || <span className="text-gray-400 italic">Nenhuma descrição disponível.</span>}
                          </div>
                       </div>
                       
                       <div>
                          <h4 className="text-sm font-bold text-gray-900 mb-2">Solução (Resposta)</h4>
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-gray-800 whitespace-pre-wrap max-h-40 overflow-y-auto">
                             {viewingOrder.solution || <span className="text-gray-400 italic">Nenhuma solução registrada.</span>}
                          </div>
                       </div>
                    </>
                 )}
              </div>

            </div>
            
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
              <button onClick={() => setViewingOrder(null)} className="px-5 py-2.5 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};