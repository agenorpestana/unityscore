import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Filter, FileText, Loader2, AlertTriangle, Printer, Database, Info, ShieldAlert } from 'lucide-react';
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
  functionName: string;
  functionId: string;
  active: boolean; 
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
  
  // Mapas de dados
  const [employeesMap, setEmployeesMap] = useState<Map<string, EmpInfo>>(new Map());
  const [usersToEmployeeMap, setUsersToEmployeeMap] = useState<Map<string, string>>(new Map()); 
  const [nameToEmployeeMap, setNameToEmployeeMap] = useState<Map<string, EmpInfo>>(new Map()); 
  
  // Novos mapas para Grupo de Usuário
  const [groupsMap, setGroupsMap] = useState<Map<string, string>>(new Map()); // id_grupo -> nome_grupo
  const [userToGroupMap, setUserToGroupMap] = useState<Map<string, string>>(new Map()); // id_usuario -> id_grupo

  const [reportData, setReportData] = useState<ReportData[] | null>(null);
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});
  const [clientCache, setClientCache] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>(''); 
  const [error, setError] = useState<string | null>(null);
  const [availableFunctions, setAvailableFunctions] = useState<string[]>([]);
  
  // Debug stats
  const [dbStats, setDbStats] = useState({ funcs: 0, emps: 0, users: 0, groups: 0, loaded: false });
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

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

  const fetchAllRecords = async (config: any, path: string, sortField: string) => {
      let allRecords: any[] = [];
      let page = 1;
      let hasMore = true;
      const rp = 1000; 

      while (hasMore) {
          try {
              const res = await safeFetch(buildUrl(config, path), {
                  method: 'POST',
                  headers: config.headers,
                  body: JSON.stringify({ 
                      qtype: sortField, 
                      query: '0', 
                      oper: '>', 
                      rp: String(rp), 
                      page: String(page),
                      sortname: sortField, 
                      sortorder: 'asc' 
                  })
              });
              
              if (res.registros && Array.isArray(res.registros)) {
                  allRecords = [...allRecords, ...res.registros];
                  if (res.registros.length < rp) hasMore = false;
                  else page++;
              } else {
                  hasMore = false;
              }
          } catch (e) {
              console.warn(`Erro buscando ${path} pag ${page}`, e);
              hasMore = false;
          }
      }
      return allRecords;
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
      // 1. Tentar buscar Funções (Cargos de RH)
      let allFunctions = await fetchAllRecords(config, '/webservice/v1/fl_funcoes', 'fl_funcoes.id');
      if (allFunctions.length === 0) {
          const retryFunctions = await fetchAllRecords(config, '/webservice/v1/fl_funcoes', 'id');
          if (retryFunctions.length > 0) allFunctions = retryFunctions;
      }

      // 2. Buscar Grupos de Usuários (NOVO - Tabela 'usuarios_grupo')
      let allGroups = await fetchAllRecords(config, '/webservice/v1/usuarios_grupo', 'usuarios_grupo.id');
      // Tentativa de fallback se falhar com prefixo
      if (allGroups.length === 0) {
          const retryGroups = await fetchAllRecords(config, '/webservice/v1/usuarios_grupo', 'id');
          if (retryGroups.length > 0) allGroups = retryGroups;
      }

      const [allEmployees, allUsers] = await Promise.all([
         fetchAllRecords(config, '/webservice/v1/funcionarios', 'funcionarios.id'),
         fetchAllRecords(config, '/webservice/v1/usuarios', 'usuarios.id')
      ]);

      setDbStats({
        funcs: allFunctions.length,
        emps: allEmployees.length,
        users: allUsers.length,
        groups: allGroups.length,
        loaded: true
      });

      // Checagem de Permissões Críticas
      if (allGroups.length === 0 && allUsers.length > 0) {
          setPermissionWarning("Atenção: Tabela 'usuarios_grupo' vazia. Verifique permissões do token no IXC.");
      } else {
          setPermissionWarning(null);
      }

      // Mapear Grupos (ID -> Nome)
      const newGroupsMap = new Map<string, string>();
      const groupNamesSet = new Set<string>();
      allGroups.forEach((g: any) => {
          const name = g.grupo || g.nome || g.descricao;
          if (g.id && name) {
              newGroupsMap.set(String(g.id), name);
              groupNamesSet.add(name);
          }
      });
      setGroupsMap(newGroupsMap);

      // Mapear Funções de Funcionário (Backup)
      const newFunctionsMap = new Map<string, string>();
      allFunctions.forEach((f: any) => { 
          const name = f.funcao || f.descricao || f.nome || f.cargo;
          if (f.id && name) { 
            newFunctionsMap.set(String(f.id), name); 
          } 
      });

      // Mapear Usuários -> Funcionário E Usuário -> Grupo
      const newUserToEmpMap = new Map<string, string>();
      const newUserToGroupMap = new Map<string, string>();

      allUsers.forEach((u: any) => {
          const userId = String(u.id);
          const funcId = String(u.funcionario);
          const groupId = String(u.id_grupo);

          if (userId) {
              if (funcId && funcId !== '0' && funcId !== '') {
                  newUserToEmpMap.set(userId, funcId);
              }
              if (groupId && groupId !== '0' && groupId !== '') {
                  newUserToGroupMap.set(userId, groupId);
              }
          }
      });
      setUsersToEmployeeMap(newUserToEmpMap);
      setUserToGroupMap(newUserToGroupMap);

      // Mapear Funcionários
      const newEmployeesMap = new Map<string, EmpInfo>();
      const newNameMap = new Map<string, EmpInfo>();
      const combinedTechList: (Technician & { role?: string })[] = [];
      
      const availableRolesSet = new Set<string>();
      groupNamesSet.forEach(g => availableRolesSet.add(g));

      allEmployees.forEach((r: any) => {
          const name = r.funcionario || r.nome || `Func. ${r.id}`;
          
          let funcName = 'Sem Função';
          const funcId = r.id_funcao;

          if (funcId && String(funcId) !== '0') {
              const mapped = newFunctionsMap.get(String(funcId));
              if (mapped) {
                  funcName = mapped;
                  availableRolesSet.add(mapped);
              }
          }

          const empInfo: EmpInfo = { 
              id: String(r.id), 
              name, 
              functionName: funcName,
              functionId: funcId ? String(funcId) : '',
              active: r.ativo === 'S'
          };

          newEmployeesMap.set(String(r.id), empInfo);

          const normalizedName = name.toLowerCase().trim();
          const existing = newNameMap.get(normalizedName);
          let shouldReplace = true;

          if (existing) {
              const existingHasFunc = existing.functionName !== 'Sem Função';
              const currentHasFunc = funcName !== 'Sem Função';
              if (existingHasFunc && !currentHasFunc) shouldReplace = false;
              else if (existingHasFunc === currentHasFunc && existing.active && !empInfo.active) shouldReplace = false;
          }

          if (shouldReplace) newNameMap.set(normalizedName, empInfo);
          if (r.ativo !== 'N') combinedTechList.push({ id: String(r.id), name, role: funcName });
      });

      setEmployeesMap(newEmployeesMap);
      setNameToEmployeeMap(newNameMap);
      setTechnicians(combinedTechList);
      setAvailableFunctions(Array.from(availableRolesSet).sort()); 
      
    } catch (e: any) {
      console.error(e);
      setError(`Falha ao carregar dados: ${e.message}`);
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
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const config = getApiConfig();
    if (!config) { setError('Configure a API.'); return; }
    
    setIsLoading(true); 
    setLoadingProgress('Iniciando busca...'); 
    setReportData(null); 
    setError(null);

    try {
      const url = buildUrl(config, '/webservice/v1/su_oss_chamado');
      const dateField = filters.dateType === 'closing' ? 'su_oss_chamado.data_fechamento' : 'su_oss_chamado.data_abertura';
      
      let allDateRegistros: any[] = [];
      let page = 1;
      let fetchedAll = false;
      const MAX_PAGES = 100;
      const PAGE_SIZE = 500;

      while (!fetchedAll && page <= MAX_PAGES) {
        if (controller.signal.aborted) break;
        setLoadingProgress(`Buscando página ${page}... (${allDateRegistros.length} registros)`);
        
        await new Promise(r => setTimeout(r, 200));

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
          }),
          signal: controller.signal
        });

        const records = dateData.registros || [];
        allDateRegistros = [...allDateRegistros, ...records];

        if (records.length < PAGE_SIZE) {
          fetchedAll = true;
        } else {
          page++;
        }
      }

      if (controller.signal.aborted) return;

      const activePromise = filters.dateType === 'closing' ? safeFetch(url, {
        method: 'POST', headers: config.headers, 
        body: JSON.stringify({ qtype: 'su_oss_chamado.status', query: 'EN', oper: '=', rp: '200', sortname: 'su_oss_chamado.id', sortorder: 'desc' }),
        signal: controller.signal
      }) : Promise.resolve({ registros: [] });

      const activeData = await activePromise.catch(() => ({ registros: [] }));
      
      const allRecords = [...allDateRegistros, ...(activeData.registros || [])];
      
      const uniqueRecordsMap = new Map();
      allRecords.forEach((item: any) => uniqueRecordsMap.set(item.id, item));
      let uniqueOrders = Array.from(uniqueRecordsMap.values());

      if (filters.dateType === 'closing') {
        uniqueOrders = uniqueOrders.filter((reg: any) => reg.status === 'F' || reg.status === 'EN');
      }

      const orders: (ServiceOrder & { technicianFunction?: string })[] = uniqueOrders.map((reg: any) => {
        let techName = reg.tecnico || 'OS SEM TÉCNICO';
        let functionName = 'Sem Função'; 
        
        const osTechId = String(reg.id_tecnico); 
        const osLoginId = String(reg.id_login);

        let candidateByTechId: EmpInfo | undefined;
        let candidateByLoginId: EmpInfo | undefined;
        let candidateByName: EmpInfo | undefined;
        
        // --- NOVA LÓGICA DE GRUPO ---
        let groupNameFromUser: string | undefined;

        // 1. Tentar pegar o Grupo do Usuário (Prioridade Máxima para Função)
        if (osLoginId && osLoginId !== '0') {
            const groupId = userToGroupMap.get(osLoginId);
            if (groupId) {
                const gName = groupsMap.get(groupId);
                if (gName) {
                    groupNameFromUser = gName;
                } else {
                    // Fallback Visual: Mostra o ID se não conseguiu traduzir (provável falta de permissão na tabela grupos)
                    groupNameFromUser = `Grupo ID: ${groupId}`;
                }
            }

            const linkedEmpId = usersToEmployeeMap.get(osLoginId);
            if (linkedEmpId) candidateByLoginId = employeesMap.get(linkedEmpId);
        }

        if (osTechId && osTechId !== '0') candidateByTechId = employeesMap.get(osTechId);
        if (reg.tecnico) candidateByName = nameToEmployeeMap.get(reg.tecnico.toLowerCase().trim());

        // --- DECISÃO DE QUEM É O TÉCNICO E QUAL A FUNÇÃO ---
        let finalCandidate: EmpInfo | undefined;

        if (candidateByLoginId) finalCandidate = candidateByLoginId;
        else if (candidateByTechId) finalCandidate = candidateByTechId;
        else finalCandidate = candidateByName;

        if (finalCandidate) {
            techName = finalCandidate.name;
            // Prioriza o Grupo do Usuário, depois a Função do Funcionário
            functionName = groupNameFromUser || finalCandidate.functionName;
        } else {
            if (groupNameFromUser) functionName = groupNameFromUser;
            else if (osLoginId !== '0') functionName = `U:${osLoginId} (Ñ Vinculado)`;
        }

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

        const finalTechId = finalCandidate ? finalCandidate.id : osTechId;

        return {
          id: reg.id,
          technicianId: finalTechId,
          technicianName: techName,
          technicianFunction: functionName, 
          clientId: reg.id_cliente ? String(reg.id_cliente) : '',
          clientName: '...',
          subjectId: reg.id_assunto,
          subjectName: '', 
          openingDate: reg.data_abertura,
          closingDate: closingDate,
          reopeningDate: reopeningDate,
          status: reg.status === 'F' ? 'Fechado' : reg.status === 'A' ? 'Aberto' : 'Em Andamento'
        };
      });

      const filteredOrders = orders.filter(order => {
          const matchTech = filters.technicianId ? order.technicianId === filters.technicianId : true;
          const role = order.technicianFunction || 'Sem Função';
          // Permite busca parcial (ex: "Grupo ID: 4" bate com filtro "4")
          const matchFunc = filters.function ? role.toLowerCase().includes(filters.function.toLowerCase()) : true;
          let relevantDate = filters.dateType === 'closing' && order.closingDate !== 'EM ABERTO' ? order.closingDate.split(' ')[0] : order.openingDate.split(' ')[0];
          
          if (filters.dateType === 'closing' && order.closingDate === 'EM ABERTO') {
             return matchTech && matchFunc;
          }

          const matchDate = relevantDate >= filters.startDate && relevantDate <= filters.endDate;
          return matchTech && matchFunc && matchDate;
      });

      setLoadingProgress('Processando relatório...');
      const grouped: Record<string, ReportData> = {};
      const clientIdsToResolve = new Set<string>();

      filteredOrders.forEach(order => {
        const groupKey = order.technicianId || order.technicianName;
        
        if (!grouped[groupKey]) {
          grouped[groupKey] = { 
              technicianId: order.technicianId, 
              technicianName: order.technicianName, 
              role: order.technicianFunction || 'Sem Função', 
              totalOrders: 0, 
              totalPoints: 0, 
              orders: [] 
          };
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
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-print-area, #report-print-area * { visibility: visible; }
          #report-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex justify-between items-center mb-6 no-print">
          <div><h2 className="text-2xl font-bold text-gray-800">Relatórios de Pontuação</h2><p className="text-gray-500">Gere relatórios sintéticos ou analíticos da performance da equipe.</p></div>
          <div className="flex flex-col items-end gap-1">
             <div className={`text-xs flex items-center gap-1 font-medium ${dbStats.groups === 0 && dbStats.loaded ? 'text-red-500' : 'text-gray-400'}`}>
                 <Database size={12} /> BD: {dbStats.emps} Func / {dbStats.users} Usuários / {dbStats.groups} Grupos
             </div>
             {permissionWarning && (
                 <div className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center gap-1" title={permissionWarning}>
                     <ShieldAlert size={10} /> 
                     <span>Permissão necessária em <b>usuarios_grupo</b></span>
                 </div>
             )}
          </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print"><h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Filter size={20} className="text-brand-600" /> Filtros do Relatório</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Data Inicial</label><input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Data Final</label><input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm" /></div></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Data de</label><select value={filters.dateType} onChange={e => setFilters({...filters, dateType: e.target.value as 'opening' | 'closing'})} className="w-full rounded-lg border-gray-300 border p-2 text-sm font-medium text-brand-700 bg-gray-50"><option value="closing">Fechamento</option><option value="opening">Abertura</option></select></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Organizar por</label><select value={filters.sortBy} onChange={e => setFilters({...filters, sortBy: e.target.value as any})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="NAME">Nome do Técnico</option><option value="POINTS">Maior Pontuação</option></select></div></div><div className="space-y-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Selecionar Técnico</label><select value={filters.technicianId} onChange={e => setFilters({...filters, technicianId: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">TODOS OS TÉCNICOS</option>{technicians.map((t, idx) => (<option key={`${t.id}-${idx}`} value={t.id}>{t.name}</option>))}</select></div><div><label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">Função (Grupo/Cargo) {permissionWarning && <span className="text-yellow-500 cursor-help" title={permissionWarning}><AlertTriangle size={12} /></span>}</label><select value={filters.function} onChange={e => setFilters({...filters, function: e.target.value})} className="w-full rounded-lg border-gray-300 border p-2 text-sm"><option value="">TODAS AS FUNÇÕES</option>{availableFunctions.map((f, i) => (<option key={i} value={f}>{f}</option>))}</select></div></div><div className="flex flex-col justify-between"><div><label className="block text-xs font-medium text-gray-500 mb-2">Tipo de Relatório</label><div className="flex items-center gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={filters.type === 'SYNTHETIC'} onChange={() => setFilters({...filters, type: 'SYNTHETIC'})} className="text-brand-600 focus:ring-brand-500" /><span className="text-sm text-gray-700">Sintético</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={filters.type === 'ANALYTICAL'} onChange={() => setFilters({...filters, type: 'ANALYTICAL'})} className="text-brand-600 focus:ring-brand-500" /><span className="text-sm text-gray-700">Analítico</span></label></div></div><button onClick={handleGenerate} disabled={isLoading} className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70">{isLoading ? <><Loader2 className="animate-spin" size={18} /><span>{loadingProgress || 'Processando...'}</span></> : <><FileText size={18} /> GERAR RELATÓRIO</>}</button></div></div></div>
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 border border-red-200"><AlertTriangle size={20} />{error}</div>}
      {reportData && (
        <div id="report-print-area" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center"><div><h3 className="font-bold text-gray-800 text-lg">Relatório de Pontuação por Funcionário ({filters.type === 'SYNTHETIC' ? 'Sintético' : 'Analítico'})</h3><p className="text-sm text-gray-500">Período: {new Date(filters.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} até {new Date(filters.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p></div><div className="flex gap-2"><button onClick={handlePrint} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors no-print"><Printer size={16} /> Imprimir</button></div></div>
          <div className="p-0 overflow-x-auto">
            {filters.type === 'SYNTHETIC' ? (
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase"><tr><th className="px-6 py-3">Nome do Funcionário</th><th className="px-6 py-3">Função</th><th className="px-6 py-3 text-center">Total de OS</th><th className="px-6 py-3 text-center">Pontos</th></tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {reportData.map(item => (
                    <tr key={item.technicianId} className="hover:bg-gray-50"><td className="px-6 py-4 font-medium text-gray-900">{item.technicianName}</td><td className="px-6 py-4 text-gray-500">{item.role === 'Sem Função' ? <span className="text-gray-400 italic">Sem Função</span> : <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs border border-gray-200">{item.role}</span>}</td><td className="px-6 py-4 text-center text-gray-700 font-mono">{item.totalOrders}</td><td className={`px-6 py-4 text-center font-bold text-lg ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>{item.totalPoints}</td></tr>
                  ))}
                  {reportData.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhum dado encontrado para o período.</td></tr>}
                </tbody>
              </table>
            ) : (
              <div className="divide-y divide-gray-200">
                {reportData.map(item => (
                  <div key={item.technicianId} className="p-6">
                    <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100"><div><h4 className="font-bold text-gray-900 text-lg">{item.technicianName}</h4><span className="text-xs text-gray-500 uppercase tracking-wide">{item.role === 'Sem Função' ? 'Sem Função' : item.role}</span></div><div className="text-right"><div className="text-xs text-gray-500">Total Pontos</div><div className={`text-xl font-bold ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>{item.totalPoints}</div></div></div>
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