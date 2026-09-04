import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Filter, 
  FileText, 
  Loader2, 
  AlertTriangle, 
  Printer, 
  Database, 
  Info, 
  ShieldAlert, 
  Gavel,
  Search,
  ChevronDown,
  ChevronUp,
  Tag,
  MessageSquare
} from 'lucide-react';
import { Technician, Company, ServiceOrder, ScoreRule, OsPenalty } from '../types';

interface ReportFilter {
  startDate: string;
  endDate: string;
  sortBy: 'NAME' | 'POINTS';
  technicianId: string;
  function: string; 
  type: 'SYNTHETIC' | 'ANALYTICAL';
  dateType: 'opening' | 'closing';
}

export interface SubjectReportFilter {
  startDate: string;
  endDate: string;
  dateType: 'closing' | 'opening';
  subjectId: string;
  responseId: string;
}

export interface SubjectItem {
  id: string;
  assunto: string;
  id_resposta_padrao?: string;
  id_resposta_padrao_finalizacao?: string;
}

export interface ResponseItem {
  id: string;
  titulo: string;
  resposta: string;
}

export interface SubjectReportRow {
  osId: string;
  clientId: string;
  clientName: string;
  subjectId: string;
  subjectTitle: string;
  responseId: string;
  responseTitle: string;
  responseContent: string;
  openingDate: string;
  closingDate: string;
  status: string;
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

// Mapeamento de emergência baseado nos dados conhecidos do cliente
const KNOWN_GROUPS: Record<string, string> = {
  '1': 'ADM',
  '2': 'Atendimento',
  '3': 'Suporte',
  '4': 'Suporte campo',
  '5': 'Atendimento caixas Externo',
  '6': 'Financeiro / Cotroladoria',
  '7': 'Bloqueado',
  '8': 'Comercial',
  '9': 'Auxiliar ADM',
  '10': 'Revenda',
  '11': 'Atendimento caixas Interno',
  '12': 'WEBSERVICE',
  '13': 'ATENDIMENTO INTERNO',
  '14': 'SUPORTE CAMPO PROJETO',
  '15': 'Atendimento (Cópia)',
  '16': 'ATENDIMENTO INTERNO FINANCEIRO'
};

export const Reports: React.FC = () => {
  const getTodayLocal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Sub-abas de relatórios
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'subjects'>('employees');

  const [filters, setFilters] = useState<ReportFilter>({
    startDate: getTodayLocal(),
    endDate: getTodayLocal(),
    sortBy: 'NAME',
    technicianId: '',
    function: '',
    type: 'SYNTHETIC',
    dateType: 'closing'
  });

  // Filtros de Relatórios por Assunto
  const [subjectFilters, setSubjectFilters] = useState<SubjectReportFilter>({
    startDate: getTodayLocal(),
    endDate: getTodayLocal(),
    dateType: 'closing',
    subjectId: '',
    responseId: ''
  });

  // Dados auxiliares para Assuntos e Respostas
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);
  const [availableResponses, setAvailableResponses] = useState<ResponseItem[]>([]);
  const [subjectsMap, setSubjectsMap] = useState<Map<string, SubjectItem>>(new Map());
  const [responsesMap, setResponsesMap] = useState<Map<string, ResponseItem>>(new Map());
  const [loadingSubjectsAndResponses, setLoadingSubjectsAndResponses] = useState(false);

  // Resultado do Relatório por Assunto
  const [subjectReportData, setSubjectReportData] = useState<SubjectReportRow[] | null>(null);
  const [isLoadingSubject, setIsLoadingSubject] = useState(false);
  const [loadingProgressSubject, setLoadingProgressSubject] = useState<string>('');
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [expandedResponseOsId, setExpandedResponseOsId] = useState<string | null>(null);
  const [subjectPage, setSubjectPage] = useState(1);
  const SUBJECT_PAGE_SIZE = 50;

  const [technicians, setTechnicians] = useState<(Technician & { role?: string })[]>([]);
  
  // Mapas de dados
  const [employeesMap, setEmployeesMap] = useState<Map<string, EmpInfo>>(new Map());
  const [usersToEmployeeMap, setUsersToEmployeeMap] = useState<Map<string, string>>(new Map()); 
  const [nameToEmployeeMap, setNameToEmployeeMap] = useState<Map<string, EmpInfo>>(new Map()); 
  
  // Novos mapas para Grupo de Usuário
  const [groupsMap, setGroupsMap] = useState<Map<string, string>>(new Map()); // id_grupo -> nome_grupo
  const [userToGroupMap, setUserToGroupMap] = useState<Map<string, string>>(new Map()); // id_usuario -> id_grupo
  const [empToGroupMap, setEmpToGroupMap] = useState<Map<string, string>>(new Map()); // id_funcionario -> id_grupo (NOVO)

  const [reportData, setReportData] = useState<ReportData[] | null>(null);
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});
  const [clientCache, setClientCache] = useState<Record<string, string>>({});
  const [osSplits, setOsSplits] = useState<Record<string, string[]>>({});
  const [osPenalties, setOsPenalties] = useState<OsPenalty[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>(''); 
  const [error, setError] = useState<string | null>(null);
  const [availableFunctions, setAvailableFunctions] = useState<string[]>([]);
  
  // Debug stats
  const [dbStats, setDbStats] = useState({ funcs: 0, emps: 0, users: 0, groups: 0, loaded: false });
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const subjectAbortControllerRef = useRef<AbortController | null>(null);

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
      },
      id: company.id
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

  const fetchSplitsFromBackend = async (companyId: string) => {
      try {
          const res = await fetch(`/api/os-splits?companyId=${companyId}`);
          if (res.ok) {
              const splits = await res.json();
              setOsSplits(splits);
          }
      } catch (e) { console.error("Erro ao carregar splits", e); }
  };

  const fetchPenaltiesFromBackend = async (companyId: string) => {
      try {
          const res = await fetch(`/api/os-penalties?companyId=${companyId}`);
          if (res.ok) {
              const text = await res.text();
              try {
                  const data = JSON.parse(text);
                  if (Array.isArray(data)) {
                      setOsPenalties(data);
                  } else {
                      setOsPenalties([]);
                  }
              } catch (e) {
                  setOsPenalties([]);
              }
          } else {
              setOsPenalties([]);
          }
      } catch (e) { 
          console.error("Erro ao carregar penalizações (rede/cors):", e); 
          setOsPenalties([]);
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

  const fetchRulesFromBackend = async (companyId: string) => {
      try {
          const res = await fetch(`/api/score-rules?companyId=${companyId}`);
          if (res.ok) {
              const dbRules = await res.json();
              setScoreRules(dbRules);
          }
      } catch (e) { console.error("Erro ao carregar regras", e); }
  };

  const fetchSubjectsAndResponses = async (config: any) => {
    setLoadingSubjectsAndResponses(true);
    try {
      const [subsData, respsData] = await Promise.all([
        fetchAllRecords(config, '/webservice/v1/su_oss_assunto', 'su_oss_assunto.id'),
        fetchAllRecords(config, '/webservice/v1/su_oss_respostas', 'su_oss_respostas.id')
      ]);

      const subList: SubjectItem[] = subsData.map((s: any) => ({
        id: String(s.id),
        assunto: s.assunto || s.descricao || `Assunto #${s.id}`,
        id_resposta_padrao: s.id_resposta_padrao ? String(s.id_resposta_padrao) : '',
        id_resposta_padrao_finalizacao: s.id_resposta_padrao_finalizacao ? String(s.id_resposta_padrao_finalizacao) : ''
      })).sort((a, b) => a.assunto.localeCompare(b.assunto));

      const respList: ResponseItem[] = respsData.map((r: any) => ({
        id: String(r.id),
        titulo: r.titulo || r.descricao || `Resposta #${r.id}`,
        resposta: r.resposta || ''
      })).sort((a, b) => a.titulo.localeCompare(b.titulo));

      setAvailableSubjects(subList);
      setAvailableResponses(respList);

      const sMap = new Map<string, SubjectItem>();
      subList.forEach(s => sMap.set(s.id, s));
      setSubjectsMap(sMap);

      const rMap = new Map<string, ResponseItem>();
      respList.forEach(r => rMap.set(r.id, r));
      setResponsesMap(rMap);
      return { subList, respList, sMap, rMap };
    } catch (err) {
      console.error("Erro ao carregar assuntos e respostas:", err);
      return null;
    } finally {
      setLoadingSubjectsAndResponses(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
  }, [getApiConfig]);

  const fetchTechnicians = async () => {
    const config = getApiConfig();
    if (!config) return;

    fetchRulesFromBackend(config.id);
    fetchSplitsFromBackend(config.id);
    fetchPenaltiesFromBackend(config.id);
    fetchSubjectsAndResponses(config);

    try {
      // 1. Tentar buscar Funções (Cargos de RH)
      let allFunctions = await fetchAllRecords(config, '/webservice/v1/fl_funcoes', 'fl_funcoes.id');
      if (allFunctions.length === 0) {
          const retryFunctions = await fetchAllRecords(config, '/webservice/v1/fl_funcoes', 'id');
          if (retryFunctions.length > 0) allFunctions = retryFunctions;
      }

      // 2. Buscar Grupos de Usuários
      let allGroups: any[] = [];
      if (allGroups.length === 0) {
        try {
            allGroups = await fetchAllRecords(config, '/webservice/v1/usuarios_grupo', 'usuarios_grupo.id');
        } catch (e) { console.warn('Erro fetch grupos padrão', e); }
      }

      if (allGroups.length === 0) {
         try {
             const res = await safeFetch(buildUrl(config, '/webservice/v1/usuarios_grupo'), {
                 method: 'POST',
                 headers: config.headers,
                 body: JSON.stringify({ qtype: 'usuarios_grupo.id', query: '0', oper: '>', rp: '1000', sortname: 'usuarios_grupo.id', sortorder: 'desc' })
             });
             if (res.registros && Array.isArray(res.registros)) {
                 allGroups = res.registros;
             }
         } catch (e) { console.warn('Erro fetch grupos Curl style', e); }
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

      // Mapear Grupos (ID -> Nome)
      const newGroupsMap = new Map<string, string>(Object.entries(KNOWN_GROUPS));
      const groupNamesSet = new Set<string>(Object.values(KNOWN_GROUPS));
      
      allGroups.forEach((g: any) => {
          const name = g.grupo || g.nome || g.descricao;
          if (g.id && name) {
              newGroupsMap.set(String(g.id), name);
              groupNamesSet.add(name);
          }
      });

      let fallbackUsed = false;
      if (allUsers.length > 0) {
          allUsers.forEach((u: any) => {
              const gId = u.id_grupo ? String(u.id_grupo) : null;
              if (gId && gId !== '0') {
                  if (!newGroupsMap.has(gId)) {
                      newGroupsMap.set(gId, `Grupo #${gId}`);
                      groupNamesSet.add(`Grupo #${gId}`);
                      fallbackUsed = true;
                  }
              }
          });
      }

      if (allGroups.length === 0 && fallbackUsed) {
             setPermissionWarning("Aviso: API de grupos falhou. Usando mapeamento interno + IDs.");
      } else {
          setPermissionWarning(null);
      }
      
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
      const newEmpToGroupMap = new Map<string, string>(); 

      allUsers.forEach((u: any) => {
          const userId = String(u.id);
          const funcId = String(u.funcionario);
          const groupId = String(u.id_grupo);

          if (userId) {
              if (funcId && funcId !== '0' && funcId !== '') {
                  newUserToEmpMap.set(userId, funcId);
                  if (groupId && groupId !== '0' && groupId !== '') {
                      newEmpToGroupMap.set(funcId, groupId);
                  }
              }
              if (groupId && groupId !== '0' && groupId !== '') {
                  newUserToGroupMap.set(userId, groupId);
              }
          }
      });
      setUsersToEmployeeMap(newUserToEmpMap);
      setUserToGroupMap(newUserToGroupMap);
      setEmpToGroupMap(newEmpToGroupMap);

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

  const getPoints = (order: ServiceOrder, splits: Record<string, string[]>, penalties: OsPenalty[]) => {
    if (order.closingDate === 'EM ABERTO') return 0;
    let points = scoreRules[order.subjectId]?.points || 0;
    
    // Split logic for reports
    const split = splits[order.id];
    if (split && split.length > 0) {
        points = Math.floor(points / split.length);
    }

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

    // Penalties logic
    const penaltiesList = Array.isArray(penalties) ? penalties : [];
    const orderPenalties = penaltiesList.filter(p => p.osId === order.id && p.technicianId === order.technicianId);
    const totalPenalty = orderPenalties.reduce((sum, p) => sum + p.amount, 0);
    points = points - totalPenalty;

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

    // Refresh Splits fresh
    await fetchSplitsFromBackend(config.id);
    await fetchPenaltiesFromBackend(config.id);

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

      // --- LOGICA DE ATRIBUIÇÃO MULTIPLA PARA RELATORIOS ---
      const processedOrders: any[] = [];

      uniqueOrders.forEach((reg: any) => {
          const splitParticipants = osSplits[reg.id]; // Array of IDs

          if (splitParticipants && splitParticipants.length > 0) {
              // Create duplicates for each participant
              splitParticipants.forEach(techId => {
                  processedOrders.push({
                      ...reg,
                      _virtualTechId: techId,
                      _isSplit: true
                  });
              });
          } else {
              // Standard attribution
              processedOrders.push(reg);
          }
      });

      const orders: (ServiceOrder & { technicianFunction?: string })[] = processedOrders.map((reg: any) => {
        let techName = reg.tecnico || 'OS SEM TÉCNICO';
        let functionName = 'Sem Função'; 
        
        // Se for split, usa o ID virtual, senão usa o ID da OS
        const osTechId = reg._isSplit ? reg._virtualTechId : String(reg.id_tecnico); 
        const osLoginId = String(reg.id_login);

        let candidateByTechId: EmpInfo | undefined;
        let candidateByLoginId: EmpInfo | undefined;
        let candidateByName: EmpInfo | undefined;
        
        let groupNameFound: string | undefined;

        // Caminho 1: Via Funcionário
        if (osTechId && osTechId !== '0') {
             const groupIdFromTech = empToGroupMap.get(osTechId);
             if (groupIdFromTech) {
                 const gName = groupsMap.get(groupIdFromTech);
                 groupNameFound = gName || `Grupo #${groupIdFromTech}`;
             }
             candidateByTechId = employeesMap.get(osTechId);
        }

        // Caminho 2: Via Login (Fallback apenas se NÃO for split, pois split define explicitamente o técnico)
        if (!reg._isSplit && !groupNameFound && osLoginId && osLoginId !== '0') {
            const groupId = userToGroupMap.get(osLoginId);
            if (groupId) {
                const gName = groupsMap.get(groupId);
                groupNameFound = gName || `Grupo #${groupId}`;
            }
            const linkedEmpId = usersToEmployeeMap.get(osLoginId);
            if (linkedEmpId) candidateByLoginId = employeesMap.get(linkedEmpId);
        }

        if (!reg._isSplit && reg.tecnico) candidateByName = nameToEmployeeMap.get(reg.tecnico.toLowerCase().trim());

        // --- DECISÃO DE QUEM É O TÉCNICO E QUAL A FUNÇÃO ---
        let finalCandidate: EmpInfo | undefined;

        if (candidateByTechId) finalCandidate = candidateByTechId; 
        else if (candidateByLoginId) finalCandidate = candidateByLoginId;
        else finalCandidate = candidateByName;

        if (finalCandidate) {
            techName = finalCandidate.name;
            functionName = groupNameFound || finalCandidate.functionName;
        } else {
            if (groupNameFound) functionName = groupNameFound;
            else if (osLoginId !== '0' && !reg._isSplit) functionName = `U:${osLoginId} (Ñ Vinculado)`;
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
        const pts = getPoints(order, osSplits, osPenalties);
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

  // --- GERADOR DO RELATÓRIO POR ASSUNTO ---
  const handleGenerateSubjectReport = async () => {
    if (subjectAbortControllerRef.current) {
      subjectAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    subjectAbortControllerRef.current = controller;

    const config = getApiConfig();
    if (!config) { 
      setSubjectError('Configure a API nas configurações da empresa.'); 
      return; 
    }

    setIsLoadingSubject(true);
    setLoadingProgressSubject('Buscando ordens de serviço...');
    setSubjectReportData(null);
    setSubjectError(null);
    setSubjectPage(1);

    // Certificar que assuntos e respostas estejam carregados
    let currentResponsesMap = responsesMap;
    let currentSubjectsMap = subjectsMap;
    let currentAvailableResponses = availableResponses;

    if (availableSubjects.length === 0 || availableResponses.length === 0) {
      const loaded = await fetchSubjectsAndResponses(config);
      if (loaded) {
        currentResponsesMap = loaded.rMap;
        currentSubjectsMap = loaded.sMap;
        currentAvailableResponses = loaded.respList;
      }
    }

    try {
      const url = buildUrl(config, '/webservice/v1/su_oss_chamado');
      const dateField = subjectFilters.dateType === 'closing' 
        ? 'su_oss_chamado.data_fechamento' 
        : 'su_oss_chamado.data_abertura';

      let allDateRegistros: any[] = [];
      let page = 1;
      let fetchedAll = false;
      const MAX_PAGES = 100;
      const PAGE_SIZE = 500;

      while (!fetchedAll && page <= MAX_PAGES) {
        if (controller.signal.aborted) break;
        setLoadingProgressSubject(`Buscando página ${page}... (${allDateRegistros.length} registros)`);

        await new Promise(r => setTimeout(r, 150));

        const dateData = await safeFetch(url, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify({
            qtype: dateField,
            query: subjectFilters.startDate,
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

      // Se for fechamento, buscar também possíveis OS em andamento/fechadas
      if (subjectFilters.dateType === 'closing') {
        try {
          const activeData = await safeFetch(url, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
              qtype: 'su_oss_chamado.status',
              query: 'EN',
              oper: '=',
              rp: '200',
              sortname: 'su_oss_chamado.id',
              sortorder: 'desc'
            }),
            signal: controller.signal
          });
          if (activeData.registros && Array.isArray(activeData.registros)) {
            allDateRegistros = [...allDateRegistros, ...activeData.registros];
          }
        } catch (e) {
          // Ignorar erro do status EN
        }
      }

      // Remover duplicatas
      const uniqueMap = new Map();
      allDateRegistros.forEach((item: any) => uniqueMap.set(String(item.id), item));
      const uniqueOrders = Array.from(uniqueMap.values());

      setLoadingProgressSubject('Filtrando e processando assuntos e respostas...');

      const rows: SubjectReportRow[] = [];
      const clientIdsToResolve = new Set<string>();

      for (const reg of uniqueOrders) {
        // Validação de Data
        const rawDate = subjectFilters.dateType === 'closing' ? reg.data_fechamento : reg.data_abertura;
        
        if (subjectFilters.dateType === 'closing') {
          if (!rawDate || rawDate === '0000-00-00 00:00:00') {
            continue; // Se filtrou por fechamento, descarta OS em aberto
          }
        }

        const relevantDate = (rawDate || '').split(' ')[0];
        if (relevantDate < subjectFilters.startDate || relevantDate > subjectFilters.endDate) {
          continue;
        }

        // Validação de Assunto
        const osSubjectId = reg.id_assunto ? String(reg.id_assunto) : '';
        if (subjectFilters.subjectId && subjectFilters.subjectId !== osSubjectId) {
          continue;
        }

        // Mapeamento do Assunto
        const subj = currentSubjectsMap.get(osSubjectId);
        const subjectTitle = subj?.assunto || (osSubjectId ? `Assunto #${osSubjectId}` : 'Sem Assunto');

        // Resposta direta vinculada na OS (se existir no chamado)
        const directRespId = String(
          reg.id_resposta || 
          reg.id_resposta_padrao || 
          reg.id_resposta_finalizacao || 
          reg.id_resposta_padrao_finalizacao || 
          ''
        );

        // Resposta padrão cadastrada no Assunto
        const defaultRespId = String(subj?.id_resposta_padrao || subj?.id_resposta_padrao_finalizacao || '');

        // Se o usuário filtrou por uma Resposta específica
        const selectedRespObj = subjectFilters.responseId ? currentResponsesMap.get(subjectFilters.responseId) : undefined;

        // Tentar encontrar resposta automática por correspondência de mensagem
        let matchedRespByMsg: ResponseItem | undefined = undefined;
        if (reg.mensagem_resposta && reg.mensagem_resposta.trim()) {
          const lowerMsg = reg.mensagem_resposta.toLowerCase().trim();
          const sortedResponses = [...currentAvailableResponses].sort((a, b) => b.titulo.length - a.titulo.length);
          matchedRespByMsg = sortedResponses.find(r => 
            r.titulo && r.titulo.trim().length >= 2 && lowerMsg.includes(r.titulo.toLowerCase().trim())
          );
        }

        // Validação de Filtro de Resposta
        if (subjectFilters.responseId) {
          const matchDirectId = directRespId === subjectFilters.responseId;
          const matchDefaultId = defaultRespId === subjectFilters.responseId;
          const matchByMsg = Boolean(
            selectedRespObj && 
            reg.mensagem_resposta && 
            reg.mensagem_resposta.toLowerCase().includes(selectedRespObj.titulo.toLowerCase().trim())
          );
          const matchDetectedId = matchedRespByMsg?.id === subjectFilters.responseId;

          if (!matchDirectId && !matchDefaultId && !matchByMsg && !matchDetectedId) {
            continue;
          }
        }

        // ID e Título da Resposta
        let respId = '-';
        let respTitle = 'Sem Resposta';
        let respContent = reg.mensagem_resposta || '';

        // Se o usuário filtrou por uma resposta específica, o campo ID / TÍTULO DA RESPOSTA recebe ela
        if (subjectFilters.responseId && selectedRespObj) {
          respId = selectedRespObj.id;
          respTitle = selectedRespObj.titulo;
        } else if (directRespId && currentResponsesMap.has(directRespId)) {
          const rObj = currentResponsesMap.get(directRespId)!;
          respId = rObj.id;
          respTitle = rObj.titulo;
        } else if (matchedRespByMsg) {
          respId = matchedRespByMsg.id;
          respTitle = matchedRespByMsg.titulo;
        } else if (defaultRespId && currentResponsesMap.has(defaultRespId)) {
          const rObj = currentResponsesMap.get(defaultRespId)!;
          respId = rObj.id;
          respTitle = rObj.titulo;
        } else if (directRespId && directRespId !== '0') {
          respId = directRespId;
          respTitle = `Resposta #${directRespId}`;
        } else if (defaultRespId && defaultRespId !== '0') {
          respId = defaultRespId;
          respTitle = `Resposta #${defaultRespId}`;
        } else if (reg.mensagem_resposta && reg.mensagem_resposta.trim()) {
          respTitle = 'Resposta Registrada na OS';
        }

        if (!respContent || respContent.trim() === '') {
          if (respId !== '-' && currentResponsesMap.has(respId)) {
            respContent = currentResponsesMap.get(respId)!.resposta || '-';
          } else {
            respContent = '-';
          }
        }

        const clientId = reg.id_cliente ? String(reg.id_cliente) : '';
        if (clientId) {
          clientIdsToResolve.add(clientId);
        }

        let statusText = 'Em Andamento';
        if (reg.status === 'F') statusText = 'Fechado';
        else if (reg.status === 'A') statusText = 'Aberto';
        else if (reg.status === 'EN') statusText = 'Encaminhado';

        rows.push({
          osId: String(reg.id),
          clientId: clientId,
          clientName: clientCache[clientId] || (clientId ? `Cliente #${clientId}` : 'Não Informado'),
          subjectId: osSubjectId,
          subjectTitle: subjectTitle,
          responseId: respId,
          responseTitle: respTitle,
          responseContent: respContent,
          openingDate: reg.data_abertura || '-',
          closingDate: reg.data_fechamento && reg.data_fechamento !== '0000-00-00 00:00:00' ? reg.data_fechamento : 'EM ABERTO',
          status: statusText
        });
      }

      // Ordenar por ID decrescente
      rows.sort((a, b) => Number(b.osId) - Number(a.osId));

      setSubjectReportData(rows);

      // Resolver nomes de clientes
      if (clientIdsToResolve.size > 0 && !controller.signal.aborted) {
        const idsNeeded = Array.from(clientIdsToResolve).filter(id => !clientCache[id]);
        if (idsNeeded.length > 0) {
          setLoadingProgressSubject('Buscando nomes de clientes...');
          await resolveClients(idsNeeded, controller.signal);
        }
      }

    } catch (e: any) {
      if (e.message !== 'Busca cancelada.') {
        console.error(e);
        setSubjectError(`Erro ao gerar relatório por assunto: ${e.message}`);
      }
    } finally {
      if (subjectAbortControllerRef.current === controller) {
        setIsLoadingSubject(false);
        setLoadingProgressSubject('');
      }
    }
  };

  // Filtragem local rápida para a tabela do Relatório por Assunto
  const filteredSubjectRows = React.useMemo(() => {
    if (!subjectReportData) return [];
    if (!subjectSearchQuery.trim()) return subjectReportData;

    const query = subjectSearchQuery.toLowerCase().trim();
    return subjectReportData.filter(row => {
      const cName = (clientCache[row.clientId] || row.clientName).toLowerCase();
      return (
        row.osId.includes(query) ||
        row.clientId.includes(query) ||
        cName.includes(query) ||
        row.subjectTitle.toLowerCase().includes(query) ||
        row.responseTitle.toLowerCase().includes(query) ||
        row.responseContent.toLowerCase().includes(query) ||
        row.status.toLowerCase().includes(query)
      );
    });
  }, [subjectReportData, subjectSearchQuery, clientCache]);

  const totalSubjectPages = Math.ceil(filteredSubjectRows.length / SUBJECT_PAGE_SIZE) || 1;
  const paginatedSubjectRows = filteredSubjectRows.slice(
    (subjectPage - 1) * SUBJECT_PAGE_SIZE,
    subjectPage * SUBJECT_PAGE_SIZE
  );

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

      {/* Header com Sub-abas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 no-print">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Relatórios</h2>
            <p className="text-gray-500 text-sm">Gere relatórios sintéticos ou analíticos por funcionário ou por assunto.</p>
          </div>

          <div className="flex flex-col items-end gap-2">
             <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200">
                <button 
                  onClick={() => setActiveSubTab('employees')} 
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                    activeSubTab === 'employees' 
                      ? 'bg-white text-brand-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileText size={16} />
                  Por Funcionário
                </button>
                <button 
                  onClick={() => setActiveSubTab('subjects')} 
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                    activeSubTab === 'subjects' 
                      ? 'bg-white text-brand-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Tag size={16} />
                  Relatórios por Assunto
                </button>
             </div>

             <div className="flex items-center gap-2">
               <div className={`text-xs flex items-center gap-1 font-medium ${dbStats.groups === 0 && dbStats.loaded ? 'text-red-500' : 'text-gray-400'}`}>
                   <Database size={12} /> BD: {dbStats.emps} Func / {dbStats.users} Usuários / {dbStats.groups} Grupos
               </div>
               {permissionWarning && (
                   <div className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1" title={permissionWarning}>
                       <ShieldAlert size={10} /> 
                       <span>{permissionWarning}</span>
                   </div>
               )}
             </div>
          </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-ABA 1: RELATÓRIO POR FUNCIONÁRIO (EXISTENTE)                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'employees' && (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Filter size={20} className="text-brand-600" /> Filtros do Relatório por Funcionário
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data Inicial</label>
                    <input 
                      type="date" 
                      value={filters.startDate} 
                      onChange={e => setFilters({...filters, startDate: e.target.value})} 
                      className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data Final</label>
                    <input 
                      type="date" 
                      value={filters.endDate} 
                      onChange={e => setFilters({...filters, endDate: e.target.value})} 
                      className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Data de</label>
                  <select 
                    value={filters.dateType} 
                    onChange={e => setFilters({...filters, dateType: e.target.value as 'opening' | 'closing'})} 
                    className="w-full rounded-lg border-gray-300 border p-2 text-sm font-medium text-brand-700 bg-gray-50"
                  >
                    <option value="closing">Fechamento</option>
                    <option value="opening">Abertura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Organizar por</label>
                  <select 
                    value={filters.sortBy} 
                    onChange={e => setFilters({...filters, sortBy: e.target.value as any})} 
                    className="w-full rounded-lg border-gray-300 border p-2 text-sm"
                  >
                    <option value="NAME">Nome do Técnico</option>
                    <option value="POINTS">Maior Pontuação</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Selecionar Técnico</label>
                  <select 
                    value={filters.technicianId} 
                    onChange={e => setFilters({...filters, technicianId: e.target.value})} 
                    className="w-full rounded-lg border-gray-300 border p-2 text-sm"
                  >
                    <option value="">TODOS OS TÉCNICOS</option>
                    {technicians.map((t, idx) => (
                      <option key={`${t.id}-${idx}`} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    Função (Grupo/Cargo) 
                    {permissionWarning && (
                      <span className="text-yellow-500 cursor-help" title={permissionWarning}>
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </label>
                  <select 
                    value={filters.function} 
                    onChange={e => setFilters({...filters, function: e.target.value})} 
                    className="w-full rounded-lg border-gray-300 border p-2 text-sm"
                  >
                    <option value="">TODAS AS FUNÇÕES</option>
                    {availableFunctions.map((f, i) => (
                      <option key={i} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Tipo de Relatório</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        checked={filters.type === 'SYNTHETIC'} 
                        onChange={() => setFilters({...filters, type: 'SYNTHETIC'})} 
                        className="text-brand-600 focus:ring-brand-500" 
                      />
                      <span className="text-sm text-gray-700">Sintético</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        checked={filters.type === 'ANALYTICAL'} 
                        onChange={() => setFilters({...filters, type: 'ANALYTICAL'})} 
                        className="text-brand-600 focus:ring-brand-500" 
                      />
                      <span className="text-sm text-gray-700">Analítico</span>
                    </label>
                  </div>
                </div>

                <button 
                  onClick={handleGenerate} 
                  disabled={isLoading} 
                  className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>{loadingProgress || 'Processando...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText size={18} /> GERAR RELATÓRIO
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 border border-red-200">
              <AlertTriangle size={20} />{error}
            </div>
          )}

          {reportData && (
            <div id="report-print-area" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">
                    Relatório de Pontuação por Funcionário ({filters.type === 'SYNTHETIC' ? 'Sintético' : 'Analítico'})
                  </h3>
                  <p className="text-sm text-gray-500">
                    Período: {new Date(filters.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} até {new Date(filters.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrint} 
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors no-print"
                  >
                    <Printer size={16} /> Imprimir
                  </button>
                </div>
              </div>

              <div className="p-0 overflow-x-auto">
                {filters.type === 'SYNTHETIC' ? (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-6 py-3">Nome do Funcionário</th>
                        <th className="px-6 py-3">Função</th>
                        <th className="px-6 py-3 text-center">Total de OS</th>
                        <th className="px-6 py-3 text-center">Penalizações</th>
                        <th className="px-6 py-3 text-center">Pontos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reportData.map(item => {
                          const techPenalties = osPenalties.filter(p => p.technicianId === item.technicianId && item.orders.some(o => o.id === p.osId));
                          const totalPenaltyAmount = techPenalties.reduce((sum, p) => sum + p.amount, 0);
                          
                          return (
                            <tr key={item.technicianId} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{item.technicianName}</td>
                                <td className="px-6 py-4 text-gray-500">
                                  {item.role === 'Sem Função' ? (
                                    <span className="text-gray-400 italic">Sem Função</span>
                                  ) : (
                                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs border border-gray-200">{item.role}</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center text-gray-700 font-mono">{item.totalOrders}</td>
                                <td className="px-6 py-4 text-center">
                                    {techPenalties.length > 0 ? (
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                              {techPenalties.length} ( -{totalPenaltyAmount} pts )
                                            </span>
                                        </div>
                                    ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className={`px-6 py-4 text-center font-bold text-lg ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>
                                  {item.totalPoints}
                                </td>
                            </tr>
                          );
                      })}
                      {reportData.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhum dado encontrado para o período.</td></tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {reportData.map(item => (
                      <div key={item.technicianId} className="p-6">
                        <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">{item.technicianName}</h4>
                            <span className="text-xs text-gray-500 uppercase tracking-wide">
                              {item.role === 'Sem Função' ? 'Sem Função' : item.role}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Total Pontos</div>
                            <div className={`text-xl font-bold ${item.totalPoints < 0 ? 'text-red-600' : 'text-brand-600'}`}>
                              {item.totalPoints}
                            </div>
                          </div>
                        </div>

                        <table className="w-full text-left text-sm">
                          <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
                            <tr>
                              <th className="py-2 pl-2">ID OS</th>
                              <th className="py-2">Nome do Cliente</th>
                              <th className="py-2">Data Fechamento</th>
                              <th className="py-2">Data Reabertura</th>
                              <th className="py-2 text-right pr-2">Pontos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {item.orders.map(order => {
                               const points = getPoints(order, osSplits, osPenalties);
                               const penalties = osPenalties.filter(p => p.osId === order.id && p.technicianId === order.technicianId);
                               return (
                                   <React.Fragment key={order.id}>
                                       <tr className="hover:bg-gray-50">
                                           <td className="py-2 pl-2 font-mono text-gray-600">#{order.id}</td>
                                           <td className="py-2 text-gray-800">
                                             {order.clientId ? (clientCache[order.clientId] || 'Buscando...') : 'N/A'}
                                           </td>
                                           <td className="py-2 text-gray-600">{formatDateBR(order.closingDate)}</td>
                                           <td className="py-2 text-orange-600 font-medium">{formatDateBR(order.reopeningDate)}</td>
                                           <td className={`py-2 text-right pr-2 font-medium ${points < 0 ? 'text-red-600' : 'text-brand-600'}`}>
                                             {points}
                                           </td>
                                       </tr>
                                       {penalties.length > 0 && (
                                           <tr className="bg-red-50">
                                               <td colSpan={5} className="py-1 px-4 text-xs text-red-700 border-b border-red-100 italic">
                                                   {penalties.map((p, idx) => (
                                                       <div key={idx} className="flex items-center gap-2">
                                                           <Gavel size={10} />
                                                           <span className="font-bold">PENALIZAÇÃO:</span> {p.reason} (-{p.amount} pts)
                                                       </div>
                                                   ))}
                                               </td>
                                           </tr>
                                       )}
                                   </React.Fragment>
                               )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                    {reportData.length === 0 && (
                      <div className="p-8 text-center text-gray-500">Nenhum dado encontrado para o período.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 2: RELATÓRIOS POR ASSUNTO (NOVO)                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'subjects' && (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Filter size={20} className="text-brand-600" /> Filtros do Relatório por Assunto
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Datas */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data Inicial</label>
                    <input 
                      type="date" 
                      value={subjectFilters.startDate} 
                      onChange={e => setSubjectFilters({...subjectFilters, startDate: e.target.value})} 
                      className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data Final</label>
                    <input 
                      type="date" 
                      value={subjectFilters.endDate} 
                      onChange={e => setSubjectFilters({...subjectFilters, endDate: e.target.value})} 
                      className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Data de</label>
                  <select 
                    value={subjectFilters.dateType} 
                    onChange={e => setSubjectFilters({...subjectFilters, dateType: e.target.value as 'closing' | 'opening'})} 
                    className="w-full rounded-lg border-gray-300 border p-2 text-sm font-medium text-brand-700 bg-gray-50 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="closing">Fechamento</option>
                    <option value="opening">Abertura</option>
                  </select>
                </div>
              </div>

              {/* Assunto */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center justify-between">
                  <span>Assunto da OS</span>
                  {loadingSubjectsAndResponses && <Loader2 size={12} className="animate-spin text-brand-600" />}
                </label>
                <select 
                  value={subjectFilters.subjectId} 
                  onChange={e => setSubjectFilters({...subjectFilters, subjectId: e.target.value})} 
                  className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">TODOS OS ASSUNTOS ({availableSubjects.length})</option>
                  {availableSubjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      [#{sub.id}] {sub.assunto}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Origem: API Assunto (su_oss_assunto)
                </p>
              </div>

              {/* Resposta */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center justify-between">
                  <span>Resposta</span>
                  {loadingSubjectsAndResponses && <Loader2 size={12} className="animate-spin text-brand-600" />}
                </label>
                <select 
                  value={subjectFilters.responseId} 
                  onChange={e => setSubjectFilters({...subjectFilters, responseId: e.target.value})} 
                  className="w-full rounded-lg border-gray-300 border p-2 text-sm focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">TODAS AS RESPOSTAS ({availableResponses.length})</option>
                  {availableResponses.map(resp => (
                    <option key={resp.id} value={resp.id}>
                      [#{resp.id}] {resp.titulo}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  Origem: API Resposta Padrão (su_oss_respostas)
                </p>
              </div>

              {/* Botão de Ação */}
              <div className="flex flex-col justify-end">
                <button 
                  onClick={handleGenerateSubjectReport} 
                  disabled={isLoadingSubject} 
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white p-3 rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isLoadingSubject ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span className="truncate">{loadingProgressSubject || 'Processando...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText size={18} /> GERAR RELATÓRIO
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {subjectError && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 border border-red-200">
              <AlertTriangle size={20} />{subjectError}
            </div>
          )}

          {subjectReportData && (
            <div className="space-y-4">
              {/* Barra Superior com Contadores e Ações */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                  <div className="p-3 bg-brand-50 text-brand-600 rounded-lg">
                    <FileText size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-gray-900">{subjectReportData.length}</div>
                    <div className="text-xs text-gray-500 font-medium">Total de OS Encontradas</div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Tag size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-gray-900">
                      {new Set(subjectReportData.map(r => r.subjectId).filter(Boolean)).size}
                    </div>
                    <div className="text-xs text-gray-500 font-medium">Assuntos Distintos</div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                  <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                    <MessageSquare size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-gray-900">
                      {subjectReportData.filter(r => r.responseId !== '-' || r.responseContent !== '-').length}
                    </div>
                    <div className="text-xs text-gray-500 font-medium">Com Resposta Preenchida</div>
                  </div>
                </div>
              </div>

              {/* Tabela Sintética */}
              <div id="report-print-area" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                {/* Header do Relatório */}
                <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                      <Tag size={18} className="text-brand-600" />
                      Relatório de Ordens de Serviço por Assunto (Sintético)
                    </h3>
                    <p className="text-xs text-gray-500">
                      Período: {new Date(subjectFilters.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} até {new Date(subjectFilters.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} • 
                      Filtrado por Data de: <span className="font-semibold text-gray-700">{subjectFilters.dateType === 'closing' ? 'Fechamento' : 'Abertura'}</span>
                      {subjectFilters.subjectId && (
                        <span> • Assunto: [#{subjectFilters.subjectId}] {subjectsMap.get(subjectFilters.subjectId)?.assunto || ''}</span>
                      )}
                      {subjectFilters.responseId && (
                        <span> • Resposta: [#{subjectFilters.responseId}] {responsesMap.get(subjectFilters.responseId)?.titulo || ''}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto no-print">
                    <div className="relative flex-1 sm:w-64">
                      <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Filtrar nesta lista..." 
                        value={subjectSearchQuery} 
                        onChange={e => {
                          setSubjectSearchQuery(e.target.value);
                          setSubjectPage(1);
                        }} 
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg border-gray-300 border text-xs focus:ring-brand-500 focus:border-brand-500" 
                      />
                    </div>
                    <button 
                      onClick={handlePrint} 
                      className="flex items-center gap-2 text-gray-700 hover:text-gray-900 bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                      <Printer size={16} /> Imprimir
                    </button>
                  </div>
                </div>

                {/* Conteúdo da Tabela */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-center w-24">ID OS</th>
                        <th className="px-4 py-3 min-w-[180px]">Cliente</th>
                        <th className="px-4 py-3 min-w-[200px]">Assunto</th>
                        <th className="px-4 py-3 min-w-[180px]">ID / Título Resposta</th>
                        <th className="px-4 py-3 min-w-[280px]">Resposta</th>
                        <th className="px-4 py-3 min-w-[140px] text-center">Data</th>
                        <th className="px-4 py-3 text-center w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {paginatedSubjectRows.map((row) => {
                        const resolvedClientName = clientCache[row.clientId] || row.clientName;
                        const isExpanded = expandedResponseOsId === row.osId;

                        return (
                          <tr key={row.osId} className="hover:bg-gray-50 transition-colors">
                            {/* ID OS */}
                            <td className="px-4 py-3 text-center font-mono font-bold text-brand-700">
                              #{row.osId}
                            </td>

                            {/* Cliente */}
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 leading-tight">
                                {resolvedClientName}
                              </div>
                              {row.clientId && (
                                <div className="text-[11px] text-gray-400 font-mono">
                                  ID Cliente: #{row.clientId}
                                </div>
                              )}
                            </td>

                            {/* Assunto */}
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-1.5">
                                <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-xs font-medium">
                                  #{row.subjectId || '-'}
                                </span>
                                <span className="text-gray-800 text-xs font-medium leading-relaxed">
                                  {row.subjectTitle}
                                </span>
                              </div>
                            </td>

                            {/* ID e Título da Resposta */}
                            <td className="px-4 py-3">
                              {row.responseId !== '-' ? (
                                <div className="flex items-start gap-1.5">
                                  <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0">
                                    #{row.responseId}
                                  </span>
                                  <span className="text-gray-800 text-xs font-semibold leading-relaxed">
                                    {row.responseTitle}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">
                                  {row.responseTitle}
                                </span>
                              )}
                            </td>

                            {/* Resposta */}
                            <td className="px-4 py-3">
                              {row.responseContent !== '-' ? (
                                <div>
                                  <div className={`text-xs text-gray-700 whitespace-pre-wrap ${!isExpanded && row.responseContent.length > 120 ? 'line-clamp-2' : ''}`}>
                                    {row.responseContent}
                                  </div>
                                  {row.responseContent.length > 120 && (
                                    <button 
                                      onClick={() => setExpandedResponseOsId(isExpanded ? null : row.osId)} 
                                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 mt-1 flex items-center gap-0.5 no-print"
                                    >
                                      {isExpanded ? (
                                        <>Ver menos <ChevronUp size={12} /></>
                                      ) : (
                                        <>Ver completo <ChevronDown size={12} /></>
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Data */}
                            <td className="px-4 py-3 text-center text-xs text-gray-600">
                              <div className="font-medium">
                                {subjectFilters.dateType === 'closing' 
                                  ? formatDateBR(row.closingDate) 
                                  : formatDateBR(row.openingDate)}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {subjectFilters.dateType === 'closing' ? 'Fechamento' : 'Abertura'}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                row.status === 'Fechado' 
                                  ? 'bg-green-50 text-green-700 border border-green-200' 
                                  : row.status === 'Aberto' 
                                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredSubjectRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-gray-500">
                            Nenhum registro encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação da Tabela Sintética */}
                {filteredSubjectRows.length > SUBJECT_PAGE_SIZE && (
                  <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between no-print">
                    <div className="text-xs text-gray-500">
                      Mostrando <span className="font-semibold">{((subjectPage - 1) * SUBJECT_PAGE_SIZE) + 1}</span> até <span className="font-semibold">{Math.min(subjectPage * SUBJECT_PAGE_SIZE, filteredSubjectRows.length)}</span> de <span className="font-semibold">{filteredSubjectRows.length}</span> OSs
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setSubjectPage(prev => Math.max(prev - 1, 1))} 
                        disabled={subjectPage === 1} 
                        className="px-3 py-1 rounded border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="text-xs text-gray-600 font-medium">
                        Página {subjectPage} de {totalSubjectPages}
                      </span>
                      <button 
                        onClick={() => setSubjectPage(prev => Math.min(prev + 1, totalSubjectPages))} 
                        disabled={subjectPage === totalSubjectPages} 
                        className="px-3 py-1 rounded border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
