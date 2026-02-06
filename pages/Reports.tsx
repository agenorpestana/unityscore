import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, Filter, FileText, Loader2, AlertTriangle, Printer, Download } from 'lucide-react';
import { Technician, Company, ServiceOrder, ScoreRule } from '../types';

interface ReportFilter {
  startDate: string;
  endDate: string;
  sortBy: 'NAME' | 'POINTS';
  technicianId: string;
  function: string;
  type: 'SYNTHETIC' | 'ANALYTICAL';
  dateType: 'opening' | 'closing';
}

interface ReportData {
  technicianId: string;
  technicianName: string;
  role: string;
  totalOrders: number;
  totalPoints: number;
  orders: ServiceOrder[];
}

interface EmpInfo {
  id: string;
  name: string;
}

export const Reports: React.FC = () => {
  const getTodayLocal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [filters, setFilters] = useState<ReportFilter>({
    startDate: getTodayLocal(),
    endDate: getTodayLocal(),
    sortBy: 'NAME',
    technicianId: '',
    function: '',
    type: 'SYNTHETIC',
    dateType: 'closing'
  });

  const [technicians, setTechnicians] = useState<(Technician & { role?: string })[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Map<string, EmpInfo>>(new Map());
  const [sectorsMap, setSectorsMap] = useState<Map<string, string>>(new Map());
  const [reportData, setReportData] = useState<ReportData[] | null>(null);
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});
  const [clientCache, setClientCache] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>(''); 
  const [error, setError] = useState<string | null>(null);
  const [availableFunctions, setAvailableFunctions] = useState<string[]>([]);
  
  // Controle de cancelamento de requisições
  const abortControllerRef = useRef<AbortController | null>(null);

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
    if (!company.id) return null;

    return {
      domain: '/api/ixc-proxy', 
      headers: { 
          'Content-Type': 'application/json',
          'x-company-id': company.id 
      }
    };
  }, []);

  const buildUrl = (config: any, path: string) => {
    return `${config.domain}${path}`;
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
    } catch (err: any) { 
        if (err.name === 'AbortError') {
            throw new Error('Busca cancelada.');
        }
        throw err; 
    }
  };

  useEffect(() => {
    const savedRules = localStorage.getItem('unity_score_rules');
    if (savedRules) setScoreRules(JSON.parse(savedRules));
    fetchTechnicians();
  }, [getApiConfig]);

  const fetchTechnicians = async () => {
    const config = getApiConfig();
    if (!config) return;

    try {
      const [sectorsData, empData] = await Promise.all([
        safeFetch(buildUrl(config, '/webservice/v1/empresa_setor'), { method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'empresa_setor.id', query: '0', oper: '>', rp: '1000', sortname: 'empresa_setor.setor', sortorder: 'asc' }) }).catch(() => ({ registros: [] })),
        safeFetch(buildUrl(config, '/webservice/v1/funcionarios'), { method: 'POST', headers: config.headers, body: JSON.stringify({ qtype: 'funcionarios.id', query: '0', oper: '>', rp: '10000', sortname: 'funcionarios.funcionario', sortorder: 'asc' }) }).catch(() => ({ registros: [] }))
      ]);

      const newSectorsMap = new Map<string, string>();
      const sectorNamesSet = new Set<string>();
      if (sectorsData.registros) {
        sectorsData.registros.forEach((s: any) => { 
          if (s.id && s.setor) { 
            newSectorsMap.set(String(s.id), s.setor); 
            sectorNamesSet.add(s.setor); 
          } 
        });
      }
      setSectorsMap(newSectorsMap);

      const newEmployeesMap = new Map<string, EmpInfo>();
      const combinedTechList: (Technician & { role?: string })[] = [];

      if (empData.registros) {
        empData.registros.forEach((r: any) => {
          const name = r.funcionario || r.nome || `Func. ${r.id}`;
          newEmployeesMap.set(String(r.id), { id: String(r.id), name });
          if (r.ativo !== 'N') {
            combinedTechList.push({ id: String(r.id), name, role: '' });
          }
        });
      }

      setEmployeesMap(newEmployeesMap);
      setTechnicians(combinedTechList);
      setAvailableFunctions(Array.from(sectorNamesSet).sort()); 
      
    } catch (e: any) {
      console.error(e);
      setError(`Falha ao carregar lista de técnicos: ${e.message}`);
    }
  };

  const getPoints = (order: ServiceOrder) => {
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

  const handlePrint = () => {
    window.print();
  };

  const handleGenerate = async () => {
    // 1. Cancelar requisições anteriores
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    // 2. Criar novo controlador
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const config = getApiConfig();
    if (!config) { setError('Configure a API.'); return; }
    
    setIsLoading(true); 
    setLoadingProgress('Iniciando busca...'); 
    setReportData(null); 
    setError(null);

    try {
      let allRegistros: any[] = [];
      let page = 1;
      let keepFetching = true;
      
      // 3. Batch Size reduzido para evitar timeouts e bloqueios
      const BATCH_SIZE = 250;
      const MAX_TOTAL_RECORDS = 5000; 
      
      const dateField = filters.dateType === 'closing' ? 'su_oss_chamado.data_fechamento' : 'su_oss_chamado.data_abertura';
      const endDateLimit = `${filters.endDate} 23:59:59`;

      while (keepFetching) {
        if (controller.signal.aborted) break;

        setLoadingProgress(`Buscando dados (${allRegistros.length} registros)...`);
        
        // 4. Delay (Throttle) para não afogar a API/Navegador
        await new Promise(r => setTimeout(r, 300));

        const osData = await safeFetch(buildUrl(config, '/webservice/v1/su_oss_chamado'), {
          method: 'POST', 
          headers: config.headers, 
          body: JSON.stringify({ 
              qtype: dateField, 
              query: filters.startDate, 
              oper: '>=', 
              page: page.toString(), 
              rp: BATCH_SIZE.toString(), 
              sortname: dateField, 
              sortorder: 'asc'
          }),
          signal: controller.signal // Passar sinal de cancelamento
        });

        const batch = osData.registros || [];
        
        if (batch.length === 0) { 
            keepFetching = false; 
            break; 
        }

        // Verifica range
        for (const reg of batch) {
           const dateToCheck = filters.dateType === 'closing' ? reg.data_fechamento : reg.data_abertura;
           
           if (dateToCheck && dateToCheck > endDateLimit) {
               keepFetching = false;
               break; 
           }

           if (dateToCheck && dateToCheck >= filters.startDate && dateToCheck <= endDateLimit) {
               allRegistros.push(reg);
           }
        }
        
        if (allRegistros.length >= MAX_TOTAL_RECORDS) {
            keepFetching = false;
        }

        if (batch.length < BATCH_SIZE) { keepFetching = false; } 
        else if (keepFetching) { page++; }
        
        // Safety Break
        if (page > 100) keepFetching = false;
      }

      if (controller.signal.aborted) return;
      if (allRegistros.length === 0) { setReportData([]); setIsLoading(false); return; }
      
      setLoadingProgress('Processando dados...');

      // Mapeamento em memória
      let orders: (ServiceOrder & { technicianGroup?: string })[] = allRegistros.map((reg: any) => {
          const techId = String(reg.id_tecnico); 
          let techName = `Técnico #${techId}`;
          if (techId && techId !== '0' && employeesMap.has(techId)) { 
             techName = employeesMap.get(techId)!.name; 
          } else if (reg.tecnico) {
             techName = reg.tecnico;
          }

          const rawFinal = reg.data_final;
          const rawFechamento = reg.data_fechamento;
          let closing = 'EM ABERTO';
          let reopeningDate = '-';
          if (rawFechamento && rawFechamento !== '0000-00-00 00:00:00') {
              closing = rawFechamento;
              if (rawFinal && rawFinal !== '0000-00-00 00:00:00') {
                  const diffInSeconds = (new Date(rawFechamento).getTime() - new Date(rawFinal).getTime()) / 1000;
                  if (diffInSeconds > 300) { closing = rawFinal; reopeningDate = rawFechamento; }
              }
          }

          return {
            id: reg.id,
            technicianId: reg.id_tecnico,
            technicianName: techName,
            clientId: reg.id_cliente ? String(reg.id_cliente) : '',
            clientName: '...', 
            subjectId: reg.id_assunto,
            subjectName: '', 
            openingDate: reg.data_abertura,
            closingDate: closing,
            reopeningDate: reopeningDate, 
            status: reg.status === 'F' ? 'Fechado' : reg.status === 'A' ? 'Aberto' : 'Em Andamento',
            technicianGroup: String(reg.setor) 
          };
      });

      // Filtragem final
      orders = orders.filter(o => {
        let relevantDate = filters.dateType === 'closing' && o.closingDate !== 'EM ABERTO' ? o.closingDate : o.openingDate;
        return relevantDate >= filters.startDate && relevantDate <= endDateLimit;
      });

      const grouped: Record<string, ReportData> = {};
      const clientIdsToResolve = new Set<string>();

      orders.forEach(order => {
        if (filters.technicianId && order.technicianId !== filters.technicianId) return;

        let role = 'Sem Setor';
        
        if (order.technicianGroup && order.technicianGroup !== '0' && sectorsMap.has(order.technicianGroup)) {
            role = sectorsMap.get(order.technicianGroup)!;
        }

        if (filters.function && role !== filters.function) return;

        const groupKey = order.technicianId || order.technicianName;
        if (!grouped[groupKey]) {
          grouped[groupKey] = { technicianId: order.technicianId, technicianName: order.technicianName, role: role, totalOrders: 0, totalPoints: 0, orders: [] };
        }
        const pts = getPoints(order);
        grouped[groupKey].totalOrders += 1;
        grouped[groupKey].totalPoints += pts;
        grouped[groupKey].orders.push(order);
        if (order.clientId) clientIdsToResolve.add(order.clientId);
      });

      let result = Object.values(grouped);
      if (filters.sortBy === 'NAME') { result.sort((a, b) => a.technicianName.localeCompare(b.technicianName)); } 
      else { result.sort((a, b) => b.totalPoints - a.totalPoints); }

      setReportData(result);
      
      // Busca assíncrona de clientes (só se não cancelado)
      if (filters.type === 'ANALYTICAL' && clientIdsToResolve.size > 0 && !controller.signal.aborted) {
        const idsNeeded = Array.from(clientIdsToResolve).filter(id => !clientCache[id]);
        if (idsNeeded.length > 0) {
           setLoadingProgress('Buscando nomes de clientes...');
           await resolveClients(idsNeeded, controller.signal);
        }
      }
    } catch (e: any) {
      if (e.message !== 'Busca cancelada.') {
          console.error(e);
          setError(`Erro ao gerar relatório: ${e.message}`);
      }
    } finally { 
        if (abortControllerRef.current === controller) {
            setIsLoading(false); 
            setLoadingProgress(''); 
        }
    }
  };

  const resolveClients = async (ids: string[], signal: AbortSignal) => {
    const config = getApiConfig();
    if (!config) return;
    const url = buildUrl(config, '/webservice/v1/cliente');
    
    const batchSize = 10;
    
    for (let i = 0; i < ids.length; i += batchSize) {
      if (signal.aborted) return;
      const batch = ids.slice(i, i + batchSize);
      const newResolved: Record<string, string> = {};

      await Promise.all(batch.map(async (id) => {
        try {
              const res = await safeFetch(url, { 
                method: 'POST', 
                headers: config.headers, 
                body: JSON.stringify({ qtype: 'cliente.id', query: id, oper: '=', rp: '1' }),
                signal: signal
              });
              
              if (res.registros && res.registros.length > 0) {
                const client = res.registros[0];
                newResolved[id] = client.fantasia || client.razao || client.nome_social || client.nome || `Cliente #${id}`;
              } else {
                newResolved[id] = `Cliente #${id}`; 
              }
        } catch (e) { newResolved[id] = `Cliente #${id}`; }
      }));

      setClientCache(prev => ({ ...prev, ...newResolved }));
      await new Promise(r => setTimeout(r, 100));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Estilos para impressão */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-print-area, #report-print-area * { visibility: visible; }
          #report-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex justify-between items-center mb-6 no-print"><div><h2 className="text-2xl font-bold text-gray-800">Relatórios de Pontuação</h2><p className="text-gray-500">Gere relatórios sintéticos ou analíticos da performance da equipe.</p></div></div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print"><h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Filter size={20} className="text-brand-600" /> Filtros do Relatório</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Data Inicial</label><input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Data Final</label><input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Data de</label><select value={filters.dateType} onChange={e => setFilters({...filters, dateType: e.target.value as 'opening' | 'closing'})} className="w-full rounded-lg border-gray-300 border p-2 text-sm font-medium text-brand-700 bg-gray-50"><option value="closing">Fechamento</option><option value="opening">Abertura</option></select></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Organizar por</label><select value={filters.sortBy} onChange={e => setFilters({...filters, sortBy: e.target.value as any})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="NAME">Nome do Técnico</option><option value="POINTS">Maior Pontuação</option></select></div></div><div className="space-y-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Selecionar Técnico</label><select value={filters.technicianId} onChange={e => setFilters({...filters, technicianId: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">TODOS OS TÉCNICOS</option>{technicians.map((t, idx) => (<option key={`${t.id}-${idx}`} value={t.id}>{t.name}</option>))}</select></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Setor (OS)</label><select value={filters.function} onChange={e => setFilters({...filters, function: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">TODOS OS SETORES</option>{availableFunctions.map((f, i) => (<option key={i} value={f}>{f}</option>))}</select></div></div><div className="flex flex-col justify-between"><div><label className="block text-xs font-medium text-gray-500 mb-2">Tipo de Relatório</label><div className="flex items-center gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={filters.type === 'SYNTHETIC'} onChange={() => setFilters({...filters, type: 'SYNTHETIC'})} className="text-brand-600 focus:ring-brand-500" /><span className="text-sm text-gray-700">Sintético</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={filters.type === 'ANALYTICAL'} onChange={() => setFilters({...filters, type: 'ANALYTICAL'})} className="text-brand-600 focus:ring-brand-500" /><span className="text-sm text-gray-700">Analítico</span></label></div></div><button onClick={handleGenerate} disabled={isLoading} className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70">{isLoading ? <><Loader2 className="animate-spin" size={18} /><span>{loadingProgress || 'Processando...'}</span></> : <><FileText size={18} /> GERAR RELATÓRIO</>}</button></div></div></div>
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 border border-red-200"><AlertTriangle size={20} />{error}</div>}
      {reportData && (
        <div id="report-print-area" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center"><div><h3 className="font-bold text-gray-800 text-lg">Relatório de Pontuação por Funcionário ({filters.type === 'SYNTHETIC' ? 'Sintético' : 'Analítico'})</h3><p className="text-sm text-gray-500">Período: {new Date(filters.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} até {new Date(filters.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p></div><div className="flex gap-2"><button onClick={handlePrint} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors no-print"><Printer size={16} /> Imprimir</button></div></div>
          <div className="p-0 overflow-x-auto">
            {filters.type === 'SYNTHETIC' ? (
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase"><tr><th className="px-6 py-3">Nome do Funcionário</th><th className="px-6 py-3">Setor</th><th className="px-6 py-3 text-center">Total de OS</th><th className="px-6 py-3 text-center">Pontos</th></tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {reportData.map(item => (
                    <tr key={item.technicianId} className="hover:bg-gray-50"><td className="px-6 py-4 font-medium text-gray-900">{item.technicianName}</td><td className="px-6 py-4 text-gray-500">{item.role === 'Sem Setor' ? <span className="text-gray-400 italic">Sem Setor</span> : <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs border border-gray-200">{item.role}</span>}</td><td className="px-6 py-4 text-center text-gray-700 font-mono">{item.totalOrders}</td><td className={`px-6 py-4 text-center font-bold text-lg ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>{item.totalPoints}</td></tr>
                  ))}
                  {reportData.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhum dado encontrado para o período.</td></tr>}
                </tbody>
              </table>
            ) : (
              <div className="divide-y divide-gray-200">
                {reportData.map(item => (
                  <div key={item.technicianId} className="p-6">
                    <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100"><div><h4 className="font-bold text-gray-900 text-lg">{item.technicianName}</h4><span className="text-xs text-gray-500 uppercase tracking-wide">{item.role === 'Sem Setor' ? 'Sem Setor' : item.role}</span></div><div className="text-right"><div className="text-xs text-gray-500">Total Pontos</div><div className={`text-xl font-bold ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>{item.totalPoints}</div></div></div>
                    <table className="w-full text-left text-sm"><thead className="text-xs text-gray-500 uppercase border-b border-gray-200"><tr><th className="py-2 pl-2">ID OS</th><th className="py-2">Nome do Cliente</th><th className="py-2">Data Fechamento</th><th className="py-2">Data Reabertura</th><th className="py-2 text-right pr-2">Pontos</th></tr></thead><tbody className="divide-y divide-gray-100">{item.orders.map(order => {
                       const points = getPoints(order);
                       return (<tr key={order.id} className="hover:bg-gray-50"><td className="py-2 pl-2 font-mono text-gray-600">#{order.id}</td><td className="py-2 text-gray-800">{order.clientId ? (clientCache[order.clientId] || 'Buscando...') : 'N/A'}</td><td className="py-2 text-gray-600">{formatDateBR(order.closingDate)}</td><td className="py-2 text-orange-600 font-medium">{formatDateBR(order.reopeningDate)}</td><td className={`py-2 text-right pr-2 font-medium ${points < 0 ? 'text-red-600' : 'text-brand-600'}`}>{points}</td></tr>)
                    })}</tbody></table>
                  </div>
                ))}
                {reportData.length === 0 && <div className="p-8 text-center text-gray-500">Nenhum dado encontrado para o período.</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};