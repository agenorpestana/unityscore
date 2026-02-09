import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Company, ScoreRule, ServiceOrder } from '../types';
import { CheckCircle, Loader2, Trophy, RefreshCw } from 'lucide-react';

interface RankingItem {
  technicianName: string;
  totalPoints: number;
  totalOrders: number;
  avatarLetter: string;
}

export const EmployeeDashboard: React.FC = () => {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});
  const [lastUpdated, setLastUpdated] = useState<string>('');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const getApiConfig = useCallback(() => {
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return null;
    const company: Company = JSON.parse(savedCompany);
    if (!company.id) return null;
    return {
      domain: '/api/ixc-proxy', 
      headers: { 'Content-Type': 'application/json', 'x-company-id': company.id },
      id: company.id
    };
  }, []);

  const buildUrl = (config: any, path: string) => `${config.domain}${path}`;

  const safeFetch = async (url: string, options: RequestInit) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error('API Error');
        return response.json();
    } catch (e: any) {
        if (e.name === 'AbortError') throw e;
        return { registros: [] };
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
              hasMore = false;
          }
      }
      return allRecords;
  };

  const getPoints = (order: ServiceOrder, rules: Record<string, ScoreRule>) => {
    if (order.closingDate === 'EM ABERTO') return 0;
    let points = rules[order.subjectId]?.points || 0;
    
    if (order.reopeningDate && order.reopeningDate !== '-') {
        const d1 = new Date(order.closingDate.split(' ')[0]);
        const d2 = new Date(order.reopeningDate.split(' ')[0]);
        const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) points = -Math.abs(points);
    }
    return points;
  };

  const loadData = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const config = getApiConfig();
    
    if (!config) {
        setLoading(false);
        return;
    }

    try {
        // 1. Load Rules
        let rules = scoreRules;
        if (Object.keys(rules).length === 0) {
            const savedRules = localStorage.getItem('unity_score_rules');
            rules = savedRules ? JSON.parse(savedRules) : {};
            setScoreRules(rules);
        }

        // 2. Fetch Employees & Users for Group Mapping
        const [allEmployees, allUsers] = await Promise.all([
             fetchAllRecords(config, '/webservice/v1/funcionarios', 'funcionarios.id'),
             fetchAllRecords(config, '/webservice/v1/usuarios', 'usuarios.id')
        ]);

        // Maps
        const techEmployees = new Map<string, string>(); // ID -> Nome
        const nameToTechId = new Map<string, string>(); // Nome -> ID
        
        allEmployees.forEach((e: any) => {
             const name = e.funcionario || e.nome;
             if (e.id && name) {
                 techEmployees.set(String(e.id), name);
                 nameToTechId.set(name.toLowerCase().trim(), String(e.id));
             }
        });

        const userToGroupMap = new Map<string, string>(); // UserID -> GroupID
        const userToEmployeeMap = new Map<string, string>(); // UserID -> EmpID
        const empToGroupMap = new Map<string, string>(); // EmpID -> GroupID

        allUsers.forEach((u: any) => {
            const uId = String(u.id);
            const gId = String(u.id_grupo);
            const empId = String(u.funcionario);

            if (gId && gId !== '0') userToGroupMap.set(uId, gId);
            if (empId && empId !== '0') {
                userToEmployeeMap.set(uId, empId);
                if (gId && gId !== '0') empToGroupMap.set(empId, gId);
            }
        });

        // 3. Fetch OS for Current Month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${currentYear}-${currentMonthStr}`;
        const queryDate = `${monthPrefix}-01`;

        const osRes = await safeFetch(buildUrl(config, '/webservice/v1/su_oss_chamado'), {
            method: 'POST', headers: config.headers,
            body: JSON.stringify({ 
                qtype: 'su_oss_chamado.data_fechamento', 
                query: queryDate, 
                oper: '>=', 
                rp: '5000', 
                sortname: 'su_oss_chamado.data_fechamento',
                sortorder: 'desc'
            }),
            signal: controller.signal
        });

        const batch = osRes.registros || [];
        const statsMonth: Record<string, { pts: number, count: number, name: string }> = {};

        batch.forEach((reg: any) => {
            // LÓGICA DE IDENTIFICAÇÃO E FILTRO DE GRUPO (Suporte Campo = 4)
            let techId = String(reg.id_tecnico);
            let techName = '';
            let groupId = '';

            // 1. Tenta pelo ID do Técnico direto
            if (techId && techId !== '0' && techEmployees.has(techId)) {
                techName = techEmployees.get(techId)!;
                groupId = empToGroupMap.get(techId) || '';
            }
            
            // 2. Fallback: Tenta pelo ID de Login (Usuário)
            if ((!techName || techId === '0') && reg.id_login) {
                const loginId = String(reg.id_login);
                const linkedEmpId = userToEmployeeMap.get(loginId);
                
                if (linkedEmpId && techEmployees.has(linkedEmpId)) {
                    techId = linkedEmpId;
                    techName = techEmployees.get(linkedEmpId)!;
                    groupId = empToGroupMap.get(linkedEmpId) || '';
                } else {
                    groupId = userToGroupMap.get(loginId) || '';
                }
            }

            // 3. Fallback: Nome escrito na OS
            if (!techName && reg.tecnico) {
                 techName = reg.tecnico;
                 const foundId = nameToTechId.get(techName.toLowerCase().trim());
                 if (foundId) {
                     techId = foundId;
                     groupId = empToGroupMap.get(foundId) || '';
                 }
            }

            if (!techName) return;

            // *** FILTRO OBRIGATÓRIO: APENAS SUPORTE CAMPO (ID 4) ***
            if (groupId !== '4') return;

            // Date Check
            let closingDateStr = reg.data_fechamento;
            let reopeningDateStr = '-';

            if (reg.data_fechamento && reg.data_fechamento !== '0000-00-00 00:00:00') {
                if (reg.data_final && reg.data_final !== '0000-00-00 00:00:00') {
                    const dFechamento = new Date(reg.data_fechamento).getTime();
                    const dFinal = new Date(reg.data_final).getTime();
                    const diffSeconds = Math.abs(dFechamento - dFinal) / 1000;
                    if (diffSeconds > 300) {
                        closingDateStr = reg.data_final;
                        reopeningDateStr = reg.data_fechamento;
                    }
                }
            }

            if (!closingDateStr || !closingDateStr.startsWith(monthPrefix)) return;

            const orderObj: ServiceOrder = {
                id: reg.id, technicianId: techId, technicianName: techName, clientId: '', clientName: '', subjectId: reg.id_assunto, subjectName: '', openingDate: reg.data_abertura, closingDate: closingDateStr, reopeningDate: reopeningDateStr, status: 'Fechado'
            };

            const points = getPoints(orderObj, rules);
            
            if (!statsMonth[techName]) statsMonth[techName] = { pts: 0, count: 0, name: techName };
            statsMonth[techName].pts += points;
            statsMonth[techName].count += 1;
        });

        const sorted = Object.values(statsMonth)
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 10)
            .map(x => ({ technicianName: x.name, totalPoints: x.pts, totalOrders: x.count, avatarLetter: x.name.charAt(0) }));

        setRanking(sorted);
        setLastUpdated(new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));

    } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
    } finally {
        if (abortControllerRef.current === controller) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [getApiConfig]);

  // Max points for bar calculation
  const maxPoints = ranking.length > 0 ? ranking[0].totalPoints : 1;

  // Split into columns for alternating layout (Odd Left, Even Right)
  const leftCol = ranking.filter((_, i) => i % 2 === 0);
  const rightCol = ranking.filter((_, i) => i % 2 !== 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
            <h1 className="text-3xl font-bold text-gray-900">Meu Desempenho</h1>
            <p className="text-gray-500 mt-1">Acompanhe o ranking de pontuação mensal (Suporte Campo).</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Atualizado: {lastUpdated}</span>
            <button onClick={loadData} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><RefreshCw size={14} /></button>
        </div>
      </header>

      {/* Dark Theme Card Matching the Image */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-8 border-b border-slate-800 pb-4">
            <CheckCircle size={28} className="text-blue-500" />
            <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Top 10 Pontuação Mensal</h2>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                 <Loader2 size={48} className="animate-spin mb-4 text-blue-500" />
                 <p>Carregando ranking...</p>
             </div>
        ) : ranking.length === 0 ? (
             <div className="py-20 text-center text-slate-500 italic">Nenhum dado de pontuação encontrado para Suporte Campo neste mês.</div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-2">
                
                {/* Columns Wrapper to simulate the layout */}
                <div className="space-y-4">
                    {leftCol.map((tech, idx) => {
                        const globalRank = idx * 2 + 1; // 1, 3, 5...
                        return (
                            <RankingRow key={tech.technicianName} tech={tech} rank={globalRank} maxPoints={maxPoints} />
                        );
                    })}
                </div>

                <div className="space-y-4">
                    {rightCol.map((tech, idx) => {
                        const globalRank = idx * 2 + 2; // 2, 4, 6...
                        return (
                             <RankingRow key={tech.technicianName} tech={tech} rank={globalRank} maxPoints={maxPoints} />
                        );
                    })}
                </div>

            </div>
        )}
      </div>
    </div>
  );
};

const RankingRow: React.FC<{ tech: RankingItem, rank: number, maxPoints: number }> = ({ tech, rank, maxPoints }) => (
    <div className="flex items-center justify-between py-3 group hover:bg-slate-900/50 rounded-lg px-2 transition-colors border-b border-slate-900/50">
        <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className="text-slate-500 font-mono text-lg w-6 shrink-0 font-bold group-hover:text-slate-400">{rank}.</span>
            <span className="text-slate-200 text-base font-bold truncate group-hover:text-white uppercase tracking-tight">{tech.technicianName}</span>
        </div>
        
        <div className="flex items-center gap-4 shrink-0 w-[45%] justify-end">
            <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 hidden sm:block">
                <div 
                    className="h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)] rounded-r-full transition-all duration-1000" 
                    style={{width: `${Math.min((tech.totalPoints / maxPoints) * 100, 100)}%`}}
                ></div>
            </div>
            <div className="flex flex-col items-end min-w-[80px]">
                <span className="text-white font-bold text-xl leading-none tracking-tight">{tech.totalPoints}</span>
                <span className="text-[10px] text-slate-500 uppercase font-semibold mt-1">{tech.totalOrders} OS Fechadas</span>
            </div>
        </div>
    </div>
);
