import React, { useEffect, useState, useCallback } from 'react';
import { Company, ScoreRule, ServiceOrder } from '../types';
import { Trophy, Medal, TrendingUp, CheckCircle, Loader2, Clock, Activity } from 'lucide-react';

interface RankingItem {
  technicianName: string;
  totalPoints: number;
  totalOrders: number;
  avatarLetter: string;
}

interface TechnicianHourlyLine {
    technicianName: string;
    color: string;
    data: number[]; // Array de 12 posições (08h as 19h)
    totalToday: number;
}

const LINE_COLORS = [
    '#10b981', // Emerald (Green)
    '#3b82f6', // Blue
    '#f59e0b', // Amber (Yellow)
    '#ec4899', // Pink
    '#8b5cf6', // Violet
];

export const TvDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('Carregando...');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Data States
  const [topMonth, setTopMonth] = useState<RankingItem[]>([]);
  const [topQuarter, setTopQuarter] = useState<RankingItem[]>([]);
  const [topOsMonth, setTopOsMonth] = useState<RankingItem[]>([]);
  
  // New State for Line Chart
  const [hourlyLines, setHourlyLines] = useState<TechnicianHourlyLine[]>([]);
  const [maxHourlyVolume, setMaxHourlyVolume] = useState(5); // Escala Y mínima
  
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
    
    // Não seta loading=true para atualizações em background (manter tela estável)
    if (!companyName || companyName === 'Carregando...') setLoading(true);
    
    setCompanyName(config.name);
    setLogoUrl(config.logo);

    // 1. Load Rules
    const savedRules = localStorage.getItem('unity_score_rules');
    const rules = savedRules ? JSON.parse(savedRules) : {};
    setScoreRules(rules);

    try {
        // 2. Get ALL Active Employees
        const empRes = await safeFetch(buildUrl(config, '/webservice/v1/funcionarios'), {
             method: 'POST', headers: config.headers,
             body: JSON.stringify({ qtype: 'funcionarios.ativo', query: 'S', oper: '=', rp: '10000' })
        });

        const techEmployees = new Map<string, string>(); // ID -> Name
        (empRes.registros || []).forEach((e: any) => {
             techEmployees.set(String(e.id), e.funcionario || e.nome);
        });

        // 3. Fetch OS Data (Last 3 Months to cover Rankings)
        const today = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        threeMonthsAgo.setDate(1); 
        
        const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const dateStr = threeMonthsAgo.toISOString().split('T')[0];

        // Fetch paginated
        let allOrders: any[] = [];
        let page = 1;
        let keepFetching = true;
        
        // Pega mais páginas para garantir volume
        while(keepFetching && page <= 100) { 
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
        
        // Hourly Distribution Per Tech (Today Only)
        // Map<TechID, Array[12]> -> 08h to 19h
        const hourlyStatsToday: Record<string, number[]> = {};
        const totalTodayPerTech: Record<string, number> = {};

        const todayDateStr = today.toLocaleDateString('pt-BR'); // Comparação simples de dia

        allOrders.forEach((reg: any) => {
            const techId = String(reg.id_tecnico);
            if (!techEmployees.has(techId)) return;

            const techName = techEmployees.get(techId)!;
            const closeDate = new Date(reg.data_fechamento);
            
            // Normalize Object
            const orderObj: ServiceOrder = {
                id: reg.id,
                technicianId: techId,
                technicianName: techName,
                clientId: '', clientName: '', subjectId: reg.id_assunto, subjectName: '',
                openingDate: reg.data_abertura, closingDate: reg.data_fechamento, 
                reopeningDate: (reg.data_final && reg.data_fechamento && reg.data_final !== reg.data_fechamento) ? reg.data_final : '-',
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
            }

            // HOURLY STATS (TODAY ONLY)
            // Checa se é hoje
            if (closeDate.toLocaleDateString('pt-BR') === todayDateStr) {
                const hour = closeDate.getHours();
                
                // Init structure if needed
                if (!hourlyStatsToday[techId]) {
                    hourlyStatsToday[techId] = new Array(12).fill(0); // 08,09...19
                    totalTodayPerTech[techId] = 0;
                }

                // Increment total
                totalTodayPerTech[techId]++;

                // Increment hour slot if within range (08h - 19h)
                if (hour >= 8 && hour <= 19) {
                    const idx = hour - 8;
                    hourlyStatsToday[techId][idx]++;
                }
            }
        });

        // --- SORT & SET RANKINGS ---
        
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

        // --- PROCESS LINE CHART DATA ---
        
        // Find top 5 techs of TODAY by volume
        const top5TodayIds = Object.keys(totalTodayPerTech)
            .sort((a, b) => totalTodayPerTech[b] - totalTodayPerTech[a])
            .slice(0, 5);
        
        let calculatedMaxY = 0;

        const linesData: TechnicianHourlyLine[] = top5TodayIds.map((id, index) => {
            const data = hourlyStatsToday[id];
            // Find max value in this array for Y-Axis scaling
            const maxInLine = Math.max(...data);
            if (maxInLine > calculatedMaxY) calculatedMaxY = maxInLine;

            const name = techEmployees.get(id) || 'Unknown';
            // Pega apenas o primeiro nome para a legenda não ficar gigante
            const shortName = name.split(' ')[0];

            return {
                technicianName: shortName,
                color: LINE_COLORS[index % LINE_COLORS.length],
                data: data,
                totalToday: totalTodayPerTech[id]
            };
        });

        setMaxHourlyVolume(calculatedMaxY > 0 ? calculatedMaxY + 1 : 5); // +1 para respiro
        setHourlyLines(linesData);

        setLastUpdated(new Date().toLocaleTimeString('pt-BR'));

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Atualiza a cada 30 segundos para "Tempo Real"
    const interval = setInterval(loadData, 30000); 
    return () => clearInterval(interval);
  }, [getApiConfig]);

  if (loading && !companyName) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
              <Loader2 size={64} className="animate-spin text-brand-500 mb-4" />
              <h2 className="text-2xl font-light">Carregando Dashboard Público...</h2>
          </div>
      );
  }

  // --- SVG CHART GENERATION HELPERS ---
  const hoursLabels = [8,9,10,11,12,13,14,15,16,17,18,19];
  const chartHeight = 200; // SVG coordinate height
  const chartWidth = 600;  // SVG coordinate width (viewBox)
  const paddingX = 40;
  const paddingY = 20;

  const getX = (index: number) => {
      return paddingX + (index * ((chartWidth - (paddingX * 2)) / (hoursLabels.length - 1)));
  };

  const getY = (value: number) => {
      const drawableHeight = chartHeight - (paddingY * 2);
      const ratio = value / maxHourlyVolume;
      return (chartHeight - paddingY) - (ratio * drawableHeight);
  };

  const generatePath = (data: number[]) => {
      return data.map((val, idx) => 
          `${idx === 0 ? 'M' : 'L'} ${getX(idx)},${getY(val)}`
      ).join(' ');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-sm">
         <div className="flex items-center gap-4">
             {logoUrl ? (
                 <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain bg-white rounded-lg p-1" />
             ) : (
                 <div className="h-16 w-16 bg-brand-600 rounded-lg flex items-center justify-center text-2xl font-bold">{companyName.charAt(0)}</div>
             )}
             <div>
                 <h1 className="text-3xl font-bold tracking-tight text-white">{companyName}</h1>
                 <p className="text-slate-400 flex items-center gap-2 text-sm"><TrendingUp size={16} /> Dashboard de Performance</p>
             </div>
         </div>
         <div className="text-right">
             <div className="text-4xl font-mono font-bold text-brand-400">
                 {new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
             </div>
             <p className="text-slate-500 text-xs mt-1 flex items-center justify-end gap-1">
                 <Activity size={10} className="text-green-500 animate-pulse" />
                 Atualizado às {lastUpdated}
             </p>
         </div>
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          
          {/* Left Column: Rankings */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              
              {/* Card: Top 3 Month */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-5 flex-1 relative overflow-hidden flex flex-col">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Trophy size={100} /></div>
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-yellow-400 uppercase tracking-wider"><Trophy size={20} /> Melhores do Mês</h2>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                      {topMonth.map((tech, idx) => (
                          <div key={idx} className={`flex items-center gap-4 p-3 rounded-xl border ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border-yellow-500/50' : 'bg-slate-700/50 border-slate-600'}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-md shadow-inner shrink-0
                                  ${idx === 0 ? 'bg-yellow-500 text-yellow-950' : idx === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-amber-100'}
                              `}>
                                  {idx + 1}º
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="font-bold text-md truncate text-white">{tech.technicianName}</p>
                                  <p className="text-xs text-slate-400">{tech.totalOrders} OS Fechadas</p>
                              </div>
                              <div className="text-right shrink-0">
                                  <span className="text-xl font-black text-brand-400">{tech.totalPoints}</span>
                                  <p className="text-[9px] uppercase text-brand-600 font-bold">Pontos</p>
                              </div>
                          </div>
                      ))}
                      {topMonth.length === 0 && <p className="text-slate-500 text-center py-4">Sem dados este mês.</p>}
                  </div>
              </div>

              {/* Card: Top 3 Quarter */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-5 flex-1 relative overflow-hidden flex flex-col">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Medal size={100} /></div>
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-400 uppercase tracking-wider"><Medal size={20} /> Trimestre (Top 3)</h2>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                      {topQuarter.map((tech, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/30 border border-slate-700/50">
                               <div className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">{idx+1}</div>
                               <div className="flex-1 truncate text-slate-200 text-sm font-medium">{tech.technicianName}</div>
                               <div className="font-bold text-indigo-400 text-sm">{tech.totalPoints} <span className="text-[10px] text-indigo-600">pts</span></div>
                          </div>
                      ))}
                      {topQuarter.length === 0 && <p className="text-slate-500 text-center py-4">Sem dados no trimestre.</p>}
                  </div>
              </div>

          </div>

          {/* Right Column: Analytics */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
              
              {/* Hourly Evolution Line Chart (HOJE) */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-6 h-1/2 flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-400 uppercase tracking-wider">
                        <Clock size={20} /> Evolução Diária (Top 5 - Hoje)
                    </h2>
                    <span className="text-xs text-white bg-red-600 px-2 py-1 rounded font-bold animate-pulse shadow-lg shadow-red-500/50">AO VIVO</span>
                  </div>
                  
                  {/* SVG Chart Container */}
                  <div className="flex-1 w-full h-full relative">
                      {hourlyLines.length === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                             Aguardando primeiros fechamentos de hoje...
                          </div>
                      ) : (
                          <div className="w-full h-full flex flex-col">
                              {/* Chart Area */}
                              <div className="flex-1 relative">
                                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                      {/* Grid Lines Y */}
                                      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                                          const y = (chartHeight - paddingY) - (tick * (chartHeight - (paddingY * 2)));
                                          return (
                                              <g key={tick}>
                                                  <line x1={paddingX} y1={y} x2={chartWidth} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                                                  <text x={paddingX - 5} y={y + 3} fill="#64748b" fontSize="10" textAnchor="end">
                                                      {Math.round(tick * maxHourlyVolume)}
                                                  </text>
                                              </g>
                                          );
                                      })}

                                      {/* X Axis Labels */}
                                      {hoursLabels.map((hour, idx) => (
                                          <text key={hour} x={getX(idx)} y={chartHeight} fill="#94a3b8" fontSize="10" textAnchor="middle">
                                              {hour}h
                                          </text>
                                      ))}

                                      {/* Data Lines */}
                                      {hourlyLines.map((line, idx) => (
                                          <g key={idx}>
                                              {/* The Line */}
                                              <path 
                                                  d={generatePath(line.data)} 
                                                  fill="none" 
                                                  stroke={line.color} 
                                                  strokeWidth="3" 
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  className="drop-shadow-lg"
                                              />
                                              {/* The Dots */}
                                              {line.data.map((val, dIdx) => (
                                                  <circle 
                                                    key={dIdx} 
                                                    cx={getX(dIdx)} 
                                                    cy={getY(val)} 
                                                    r="3" 
                                                    fill={line.color} 
                                                    stroke="#1e293b" 
                                                    strokeWidth="1"
                                                  />
                                              ))}
                                          </g>
                                      ))}
                                  </svg>
                              </div>
                              
                              {/* Legend */}
                              <div className="h-8 flex items-center justify-center gap-4 mt-2">
                                  {hourlyLines.map((line, idx) => (
                                      <div key={idx} className="flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full border border-slate-600">
                                          <div className="w-3 h-3 rounded-full" style={{backgroundColor: line.color}}></div>
                                          <span className="text-xs font-bold text-slate-200">{line.technicianName}</span>
                                          <span className="text-[10px] text-slate-400 font-mono">({line.totalToday})</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* Top 10 Volume */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-5 h-1/2 flex flex-col">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-400 uppercase tracking-wider"><CheckCircle size={20} /> Top 10 - Mais OS Fechadas (Mês)</h2>
                  <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 overflow-y-auto pr-2">
                       {topOsMonth.map((tech, idx) => (
                           <div key={idx} className="flex items-center justify-between border-b border-slate-700/50 py-2">
                               <div className="flex items-center gap-3 min-w-0">
                                   <span className="text-slate-500 font-mono text-sm w-4 shrink-0">{idx+1}</span>
                                   <span className="text-slate-200 text-sm font-medium truncate">{tech.technicianName}</span>
                               </div>
                               <div className="flex items-center gap-2 shrink-0">
                                   <div className="h-2 w-16 md:w-24 bg-slate-700 rounded-full overflow-hidden">
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