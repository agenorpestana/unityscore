import React, { useEffect, useState, useCallback } from 'react';
import { Company, ScoreRule, ServiceOrder } from '../types';
import { Trophy, Medal, TrendingUp, CheckCircle, Loader2, BarChart3, Calendar } from 'lucide-react';

interface RankingItem {
  technicianName: string;
  totalPoints: number;
  totalOrders: number;
  avatarLetter: string;
}

interface EvolutionItem {
    name: string;
    weeks: number[]; // Contagem das ultimas 4 semanas
}

export const TvDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('Carregando...');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Data States
  const [topMonth, setTopMonth] = useState<RankingItem[]>([]);
  const [topQuarter, setTopQuarter] = useState<RankingItem[]>([]);
  const [topOsMonth, setTopOsMonth] = useState<RankingItem[]>([]);
  const [evolutionData, setEvolutionData] = useState<EvolutionItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});

  // Helpers
  const getApiConfig = useCallback(() => {
    const savedCompany = localStorage.getItem('unity_company_data');
    if (!savedCompany) return null;
    const company: Company = JSON.parse(savedCompany);
    if (!company.id) return null;
    return {
      domain: '/api/ixc-proxy', 
      headers: { 'Content-Type': 'application/json', 'x-company-id': company.id },
      name: company.name,
      logo: company.logoUrl
    };
  }, []);

  const buildUrl = (config: any, path: string) => `${config.domain}${path}`;

  const safeFetch = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('API Error');
    return response.json();
  };

  const getPoints = (order: ServiceOrder, rules: Record<string, ScoreRule>) => {
    if (order.closingDate === 'EM ABERTO') return 0;
    let points = rules[order.subjectId]?.points || 0;
    if (order.reopeningDate && order.reopeningDate !== '-') {
        const d1 = new Date(order.closingDate);
        const d2 = new Date(order.reopeningDate);
        const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) points = -Math.abs(points);
    }
    return points;
  };

  const loadData = async () => {
    const config = getApiConfig();
    if (!config) return;
    
    setLoading(true);
    setCompanyName(config.name);
    setLogoUrl(config.logo);

    // 1. Load Rules
    const savedRules = localStorage.getItem('unity_score_rules');
    const rules = savedRules ? JSON.parse(savedRules) : {};
    setScoreRules(rules);

    try {
        // 2. Identify "TECNICO" Sector ID
        const sectorsRes = await safeFetch(buildUrl(config, '/webservice/v1/empresa_setor'), {
            method: 'POST', headers: config.headers,
            body: JSON.stringify({ qtype: 'empresa_setor.id', query: '0', oper: '>', rp: '1000' })
        });
        
        // Procura por setor que contenha "TECNICO" ou "TÉCNICO"
        const techSectorIds = (sectorsRes.registros || [])
            .filter((s: any) => s.setor && s.setor.toUpperCase().includes('CNICO'))
            .map((s: any) => s.id);

        if (techSectorIds.length === 0) {
            console.warn("Setor TÉCNICO não encontrado. Exibindo geral.");
        }

        // 3. Get Employees from that sector
        const empRes = await safeFetch(buildUrl(config, '/webservice/v1/funcionarios'), {
             method: 'POST', headers: config.headers,
             body: JSON.stringify({ qtype: 'funcionarios.ativo', query: 'S', oper: '=', rp: '10000' })
        });

        const techEmployees = new Map<string, string>(); // ID -> Name
        (empRes.registros || []).forEach((e: any) => {
             // Se achou setor tecnico, filtra. Se não achou nenhum setor tecnico, pega todos.
             if (techSectorIds.length === 0 || techSectorIds.includes(e.setor_id)) {
                 techEmployees.set(String(e.id), e.funcionario || e.nome);
             }
        });

        // 4. Fetch OS Data (Last 3 Months)
        const today = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        threeMonthsAgo.setDate(1); // 1st day of 3 months ago
        
        const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const dateStr = threeMonthsAgo.toISOString().split('T')[0];

        // Fetch paginated
        let allOrders: any[] = [];
        let page = 1;
        let keepFetching = true;
        
        while(keepFetching && page <= 50) { // Limit pages for safety
            const osRes = await safeFetch(buildUrl(config, '/webservice/v1/su_oss_chamado'), {
                method: 'POST', headers: config.headers,
                body: JSON.stringify({ 
                    qtype: 'su_oss_chamado.data_fechamento', 
                    query: dateStr, 
                    oper: '>=', 
                    page: String(page),
                    rp: '500'
                })
            });
            const batch = osRes.registros || [];
            if (batch.length === 0) break;
            allOrders = [...allOrders, ...batch];
            if (batch.length < 500) keepFetching = false;
            page++;
        }

        // Process Data
        const statsMonth: Record<string, { pts: number, count: number, name: string }> = {};
        const statsQuarter: Record<string, { pts: number, count: number, name: string }> = {};
        const weeklyEvolution: Record<string, number[]> = {}; // TechID -> [Week1, Week2, Week3, Week4]

        allOrders.forEach((reg: any) => {
            const techId = String(reg.id_tecnico);
            if (!techEmployees.has(techId)) return; // Filter by sector

            const techName = techEmployees.get(techId)!;
            const closeDate = new Date(reg.data_fechamento);
            
            // Normalize Object
            const orderObj: ServiceOrder = {
                id: reg.id,
                technicianId: techId,
                technicianName: techName,
                clientId: '', clientName: '', subjectId: reg.id_assunto, subjectName: '',
                openingDate: reg.data_abertura, closingDate: reg.data_fechamento, 
                reopeningDate: (reg.data_final && reg.data_fechamento && reg.data_final !== reg.data_fechamento) ? reg.data_final : '-', // Simple logic
                status: 'Fechado'
            };

            const points = getPoints(orderObj, rules);

            // Quarter Stats
            if (!statsQuarter[techId]) statsQuarter[techId] = { pts: 0, count: 0, name: techName };
            statsQuarter[techId].pts += points;
            statsQuarter[techId].count += 1;

            // Current Month Stats
            if (closeDate >= firstDayCurrentMonth) {
                if (!statsMonth[techId]) statsMonth[techId] = { pts: 0, count: 0, name: techName };
                statsMonth[techId].pts += points;
                statsMonth[techId].count += 1;

                // Evolution (Simplified to 4 weeks relative to start of month)
                if (!weeklyEvolution[techId]) weeklyEvolution[techId] = [0, 0, 0, 0, 0];
                const day = closeDate.getDate();
                const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
                weeklyEvolution[techId][weekIndex]++;
            }
        });

        // Sort & Set State
        
        // 1. Top 3 Points Month
        const rankMonth = Object.values(statsMonth)
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 3)
            .map(x => ({ technicianName: x.name, totalPoints: x.pts, totalOrders: x.count, avatarLetter: x.name.charAt(0) }));
        setTopMonth(rankMonth);

        // 2. Top 3 Points Quarter
        const rankQuarter = Object.values(statsQuarter)
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 3)
            .map(x => ({ technicianName: x.name, totalPoints: x.pts, totalOrders: x.count, avatarLetter: x.name.charAt(0) }));
        setTopQuarter(rankQuarter);

        // 3. Top 10 OS Count Month
        const rankOs = Object.values(statsMonth)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(x => ({ technicianName: x.name, totalPoints: x.pts, totalOrders: x.count, avatarLetter: x.name.charAt(0) }));
        setTopOsMonth(rankOs);

        // 4. Evolution Data (Top 5 Techs by Volume)
        const top5VolTechIds = Object.keys(statsMonth)
            .sort((a, b) => statsMonth[b].count - statsMonth[a].count)
            .slice(0, 5);
        
        const evoData = top5VolTechIds.map(id => ({
            name: statsMonth[id].name.split(' ')[0], // First name
            weeks: weeklyEvolution[id]
        }));
        setEvolutionData(evoData);

        setLastUpdated(new Date().toLocaleTimeString('pt-BR'));

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300000); // 5 min auto refresh
    return () => clearInterval(interval);
  }, [getApiConfig]);

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
              <Loader2 size={64} className="animate-spin text-brand-500 mb-4" />
              <h2 className="text-2xl font-light">Carregando Dashboard Público...</h2>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-sm">
         <div className="flex items-center gap-4">
             {logoUrl ? (
                 <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain bg-white rounded-lg p-1" />
             ) : (
                 <div className="h-16 w-16 bg-brand-600 rounded-lg flex items-center justify-center text-2xl font-bold">{companyName.charAt(0)}</div>
             )}
             <div>
                 <h1 className="text-3xl font-bold tracking-tight text-white">{companyName}</h1>
                 <p className="text-slate-400 flex items-center gap-2 text-sm"><TrendingUp size={16} /> Dashboard de Performance - Setor Técnico</p>
             </div>
         </div>
         <div className="text-right">
             <div className="text-4xl font-mono font-bold text-brand-400">
                 {new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
             </div>
             <p className="text-slate-500 text-xs mt-1">Atualizado às {lastUpdated}</p>
         </div>
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-160px)]">
          
          {/* Left Column: Rankings */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              
              {/* Card: Top 3 Month */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-6 flex-1 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Trophy size={100} /></div>
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-yellow-400 uppercase tracking-wider"><Trophy size={24} /> Melhores do Mês</h2>
                  
                  <div className="space-y-4">
                      {topMonth.map((tech, idx) => (
                          <div key={idx} className={`flex items-center gap-4 p-4 rounded-xl border ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border-yellow-500/50' : 'bg-slate-700/50 border-slate-600'}`}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-inner
                                  ${idx === 0 ? 'bg-yellow-500 text-yellow-950' : idx === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-amber-100'}
                              `}>
                                  {idx + 1}º
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="font-bold text-lg truncate text-white">{tech.technicianName}</p>
                                  <p className="text-xs text-slate-400">{tech.totalOrders} OS Fechadas</p>
                              </div>
                              <div className="text-right">
                                  <span className="text-2xl font-black text-brand-400">{tech.totalPoints}</span>
                                  <p className="text-[10px] uppercase text-brand-600 font-bold">Pontos</p>
                              </div>
                          </div>
                      ))}
                      {topMonth.length === 0 && <p className="text-slate-500 text-center py-4">Sem dados este mês.</p>}
                  </div>
              </div>

              {/* Card: Top 3 Quarter */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-6 flex-1 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Medal size={100} /></div>
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400 uppercase tracking-wider"><Medal size={24} /> Trimestre (Top 3)</h2>
                  
                  <div className="space-y-4">
                      {topQuarter.map((tech, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-3 rounded-xl bg-slate-700/30 border border-slate-700/50">
                               <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center font-bold text-sm text-slate-300">{idx+1}</div>
                               <div className="flex-1 truncate text-slate-200 font-medium">{tech.technicianName}</div>
                               <div className="font-bold text-indigo-400">{tech.totalPoints} <span className="text-xs text-indigo-600">pts</span></div>
                          </div>
                      ))}
                      {topQuarter.length === 0 && <p className="text-slate-500 text-center py-4">Sem dados no trimestre.</p>}
                  </div>
              </div>

          </div>

          {/* Right Column: Analytics */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
              
              {/* Evolution Chart (Simplified Bars) */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-6 h-1/2 flex flex-col">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400 uppercase tracking-wider"><TrendingUp size={20} /> Evolução de OS (Top 5 - Semana a Semana)</h2>
                  <div className="flex-1 flex items-end justify-between gap-4 px-4 pb-2 border-b border-slate-700">
                      {evolutionData.map((tech, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                              <div className="w-full flex items-end justify-center gap-1 h-32">
                                  {tech.weeks.map((val, wIdx) => {
                                      const height = Math.min(val * 4, 100); // Scale
                                      return (
                                        <div key={wIdx} className="w-full bg-emerald-500/20 rounded-t relative group-hover:bg-emerald-500/40 transition-all" style={{height: `${Math.max(height, 5)}%`}}>
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-300 opacity-0 group-hover:opacity-100">{val}</div>
                                        </div>
                                      )
                                  })}
                              </div>
                              <p className="text-xs font-bold text-slate-400 truncate w-full text-center">{tech.name}</p>
                          </div>
                      ))}
                      {evolutionData.length === 0 && <div className="w-full h-full flex items-center justify-center text-slate-600">Gráfico indisponível (poucos dados)</div>}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 px-4 mt-2">
                       <span>Semana 1</span><span>Semana 2</span><span>Semana 3</span><span>Semana 4+</span>
                  </div>
              </div>

              {/* Top 10 Volume */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-6 h-1/2 flex flex-col">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-400 uppercase tracking-wider"><CheckCircle size={20} /> Top 10 - Mais OS Fechadas (Mês Atual)</h2>
                  <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 overflow-y-auto pr-2">
                       {topOsMonth.map((tech, idx) => (
                           <div key={idx} className="flex items-center justify-between border-b border-slate-700/50 py-2">
                               <div className="flex items-center gap-3">
                                   <span className="text-slate-500 font-mono text-sm w-4">{idx+1}</span>
                                   <span className="text-slate-200 text-sm font-medium truncate max-w-[150px]">{tech.technicianName}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                   <div className="h-2 w-24 bg-slate-700 rounded-full overflow-hidden">
                                       <div className="h-full bg-blue-500" style={{width: `${Math.min(tech.totalOrders * 2, 100)}%`}}></div>
                                   </div>
                                   <span className="text-blue-400 font-bold text-sm w-8 text-right">{tech.totalOrders}</span>
                               </div>
                           </div>
                       ))}
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};