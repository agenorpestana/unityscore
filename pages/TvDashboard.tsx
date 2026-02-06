import React, { useEffect, useState, useCallback } from 'react';
import { Company, ScoreRule, ServiceOrder } from '../types';
import { Trophy, Medal, TrendingUp, CheckCircle, Loader2, Clock, Activity, Zap } from 'lucide-react';

interface RankingItem {
  technicianName: string;
  totalPoints: number;
  totalOrders: number;
  avatarLetter: string;
}

interface TechnicianHourlyLine {
    technicianName: string;
    fullName: string;
    color: string;
    data: number[]; // Array de 12 posições (08h as 19h)
    totalToday: number;
    lastHourCount: number; // Quantos fechou na última hora cheia
}

// Cores de alto contraste para fundo escuro
const LINE_COLORS = [
    '#22c55e', // Green 500
    '#3b82f6', // Blue 500
    '#eab308', // Yellow 500
    '#f43f5e', // Rose 500
    '#a855f7', // Purple 500
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
  const [maxHourlyVolume, setMaxHourlyVolume] = useState(5); 
  
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [scoreRules, setScoreRules] = useState<Record<string, ScoreRule>>({});
  const [isUpdating, setIsUpdating] = useState(false);

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
        // Cálculo simples de dias para evitar timezone no Date object
        const d1 = new Date(order.closingDate.split(' ')[0]);
        const d2 = new Date(order.reopeningDate.split(' ')[0]);
        const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) points = -Math.abs(points);
    }
    return points;
  };

  const loadData = async () => {
    setIsUpdating(true);
    const config = getApiConfig();
    if (!config) {
        setIsUpdating(false);
        return;
    }
    
    // Loading inicial apenas
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
        const now = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        threeMonthsAgo.setDate(1); 
        
        const dateStr = threeMonthsAgo.toISOString().split('T')[0];

        // Prepare Date Strings for precise Comparison (No Timezone issues)
        const currentYear = now.getFullYear();
        const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
        const currentDayStr = String(now.getDate()).padStart(2, '0');
        const currentHour = now.getHours();

        // Prefixes for string matching (YYYY-MM and YYYY-MM-DD)
        const monthPrefix = `${currentYear}-${currentMonthStr}`; // ex: "2024-05"
        const todayPrefix = `${currentYear}-${currentMonthStr}-${currentDayStr}`; // ex: "2024-05-20"

        // Fetch paginated
        let allOrders: any[] = [];
        let page = 1;
        let keepFetching = true;
        
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

        allOrders.forEach((reg: any) => {
            const techId = String(reg.id_tecnico);
            if (!techEmployees.has(techId)) return;

            const techName = techEmployees.get(techId)!;
            
            // Importante: Tratamento de String direto para evitar problema de Timezone
            const closingDateStr = reg.data_fechamento; // "YYYY-MM-DD HH:mm:ss"
            if (!closingDateStr) return;

            // Normalize Object
            const orderObj: ServiceOrder = {
                id: reg.id,
                technicianId: techId,
                technicianName: techName,
                clientId: '', clientName: '', subjectId: reg.id_assunto, subjectName: '',
                openingDate: reg.data_abertura, closingDate: closingDateStr, 
                reopeningDate: (reg.data_final && reg.data_fechamento && reg.data_final !== reg.data_fechamento) ? reg.data_final : '-',
                status: 'Fechado'
            };

            const points = getPoints(orderObj, rules);

            // Quarter Stats (Simplificado: Acumula tudo que veio na query "Last 3 months")
            if (!statsQuarter[techId]) statsQuarter[techId] = { pts: 0, count: 0, name: techName };
            statsQuarter[techId].pts += points;
            statsQuarter[techId].count += 1;

            // Current Month Stats (String Comparison)
            if (closingDateStr.startsWith(monthPrefix)) {
                if (!statsMonth[techId]) statsMonth[techId] = { pts: 0, count: 0, name: techName };
                statsMonth[techId].pts += points;
                statsMonth[techId].count += 1;
            }

            // HOURLY STATS (TODAY ONLY) - String Comparison
            if (closingDateStr.startsWith(todayPrefix)) {
                // Parse Hour from String "YYYY-MM-DD HH:mm:ss"
                // Split by space -> get time part -> split by colon -> get hour
                const timePart = closingDateStr.split(' ')[1]; // "HH:mm:ss"
                const hourStr = timePart ? timePart.split(':')[0] : null;
                
                if (hourStr) {
                    const hour = parseInt(hourStr, 10);
                    
                    if (!hourlyStatsToday[techId]) {
                        hourlyStatsToday[techId] = new Array(12).fill(0); // 08h-19h
                        totalTodayPerTech[techId] = 0;
                    }

                    totalTodayPerTech[techId]++;

                    if (hour >= 8 && hour <= 19) {
                        const idx = hour - 8;
                        hourlyStatsToday[techId][idx]++;
                    }
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
            const maxInLine = Math.max(...data);
            if (maxInLine > calculatedMaxY) calculatedMaxY = maxInLine;

            const fullName = techEmployees.get(id) || 'Unknown';
            const shortName = fullName.split(' ')[0];
            
            // Last active hour count (para o sparkline ou indicador)
            const currentHourIdx = Math.max(0, Math.min(currentHour - 8, 11));
            const lastCount = data[currentHourIdx] || 0;

            return {
                technicianName: shortName,
                fullName: fullName,
                color: LINE_COLORS[index % LINE_COLORS.length],
                data: data,
                totalToday: totalTodayPerTech[id],
                lastHourCount: lastCount
            };
        });

        // Se ninguém trabalhou hoje ainda, cria dados dummy zerados para 1 tecnico para não quebrar o layout
        if (linesData.length === 0) {
             setMaxHourlyVolume(5);
        } else {
             setMaxHourlyVolume(calculatedMaxY > 0 ? calculatedMaxY + 1 : 5);
        }
        
        setHourlyLines(linesData);
        setLastUpdated(new Date().toLocaleTimeString('pt-BR'));

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
        setIsUpdating(false);
    }
  };

  useEffect(() => {
    loadData();
    // Atualiza a cada 30 segundos
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
  const chartHeight = 250; 
  const chartWidth = 600;  
  const paddingX = 40;
  const paddingY = 30;

  const getX = (index: number) => {
      return paddingX + (index * ((chartWidth - (paddingX * 2)) / (hoursLabels.length - 1)));
  };

  const getY = (value: number) => {
      const drawableHeight = chartHeight - (paddingY * 2);
      const ratio = value / maxHourlyVolume;
      return (chartHeight - paddingY) - (ratio * drawableHeight);
  };

  const generatePath = (data: number[]) => {
      // Se não tem dados, retorna linha no zero
      if(!data || data.length === 0) return `M ${paddingX},${chartHeight-paddingY} L ${chartWidth-paddingX},${chartHeight-paddingY}`;

      // Smooth Curve (Catmull-Rom or Simple Cubic Bezier could be better, but sticking to straight lines for clarity on TV)
      // Para TV, linhas retas são mais fáceis de ler o valor exato no ponto.
      return data.map((val, idx) => 
          `${idx === 0 ? 'M' : 'L'} ${getX(idx)},${getY(val)}`
      ).join(' ');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 overflow-hidden font-sans selection:bg-brand-500 selection:text-white">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">
         <div className="flex items-center gap-5">
             <div className="bg-white rounded-xl p-2 h-20 w-20 flex items-center justify-center shadow-lg">
                {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                    <span className="text-3xl font-bold text-slate-800">{companyName.charAt(0)}</span>
                )}
             </div>
             <div>
                 <h1 className="text-4xl font-black tracking-tight text-white mb-1">{companyName}</h1>
                 <p className="text-slate-400 flex items-center gap-2 font-medium uppercase tracking-widest text-xs">
                    <Zap size={14} className="text-yellow-400" /> Performance em Tempo Real
                 </p>
             </div>
         </div>
         <div className="text-right">
             <div className="text-5xl font-mono font-bold text-white tracking-tighter shadow-black drop-shadow-lg">
                 {new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
             </div>
             <div className="flex items-center justify-end gap-2 mt-2">
                 <div className={`h-2 w-2 rounded-full ${isUpdating ? 'bg-green-400 animate-ping' : 'bg-slate-600'}`}></div>
                 <p className="text-slate-500 text-xs font-mono">Última atualização: {lastUpdated}</p>
             </div>
         </div>
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-170px)]">
          
          {/* Left Column: Rankings */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-full">
              
              {/* Card: Top 3 Month */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col relative overflow-hidden h-1/2">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Trophy size={140} /></div>
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                      <Trophy size={24} className="text-yellow-400" />
                      <h2 className="text-xl font-bold text-white uppercase tracking-wider">Campeões do Mês</h2>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      {topMonth.map((tech, idx) => (
                          <div key={idx} className={`flex items-center gap-4 p-3 rounded-xl border transition-all transform hover:scale-[1.02] ${idx === 0 ? 'bg-gradient-to-r from-yellow-900/40 to-slate-900 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'bg-slate-800/40 border-slate-700'}`}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-inner shrink-0
                                  ${idx === 0 ? 'bg-yellow-500 text-yellow-950' : idx === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-amber-100'}
                              `}>
                                  {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className={`font-bold text-lg truncate ${idx === 0 ? 'text-yellow-400' : 'text-white'}`}>{tech.technicianName}</p>
                                  <p className="text-xs text-slate-400 font-mono">{tech.totalOrders} OS Fechadas</p>
                              </div>
                              <div className="text-right shrink-0">
                                  <span className={`text-2xl font-black ${idx === 0 ? 'text-yellow-400' : 'text-white'}`}>{tech.totalPoints}</span>
                                  <p className="text-[9px] uppercase text-slate-500 font-bold">Pontos</p>
                              </div>
                          </div>
                      ))}
                      {topMonth.length === 0 && <p className="text-slate-600 text-center py-10 italic">Aguardando dados...</p>}
                  </div>
              </div>

              {/* Card: Top 3 Quarter */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl p-5 flex-1 relative overflow-hidden flex flex-col h-1/2">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Medal size={140} /></div>
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                      <Medal size={24} className="text-indigo-400" />
                      <h2 className="text-xl font-bold text-white uppercase tracking-wider">Top Trimestre</h2>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                      {topQuarter.map((tech, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-800">
                               <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center font-bold text-sm text-slate-300 shrink-0 border border-slate-600">{idx+1}</div>
                               <div className="flex-1 truncate text-slate-200 font-medium">{tech.technicianName}</div>
                               <div className="font-bold text-indigo-400 text-lg">{tech.totalPoints} <span className="text-[10px] text-indigo-600 font-normal">pts</span></div>
                          </div>
                      ))}
                      {topQuarter.length === 0 && <p className="text-slate-600 text-center py-10 italic">Aguardando dados...</p>}
                  </div>
              </div>

          </div>

          {/* Right Column: Analytics */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-full">
              
              {/* Hourly Evolution Line Chart (HOJE) - REDESIGNED */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl p-0 h-[60%] flex flex-col relative overflow-hidden">
                  
                  {/* Header do Gráfico */}
                  <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
                    <h2 className="text-xl font-bold flex items-center gap-3 text-emerald-400 uppercase tracking-wider">
                        <Clock size={24} /> Produtividade Diária (Hoje)
                    </h2>
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                         <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                         <span className="text-xs font-bold text-white">EM TEMPO REAL</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-1 overflow-hidden">
                      {/* LADO ESQUERDO: GRÁFICO SVG */}
                      <div className="flex-[3] relative p-4 h-full">
                          {hourlyLines.length === 0 ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                                 <Clock size={48} className="mb-2 opacity-50"/>
                                 <p>Aguardando primeiros fechamentos de hoje...</p>
                              </div>
                          ) : (
                              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                  {/* Grid Lines Y */}
                                  {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                                      const y = (chartHeight - paddingY) - (tick * (chartHeight - (paddingY * 2)));
                                      return (
                                          <g key={tick}>
                                              <line x1={paddingX} y1={y} x2={chartWidth} y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="4" />
                                              <text x={paddingX - 10} y={y + 4} fill="#475569" fontSize="12" textAnchor="end" fontWeight="bold">
                                                  {Math.round(tick * maxHourlyVolume)}
                                              </text>
                                          </g>
                                      );
                                  })}

                                  {/* X Axis Labels */}
                                  {hoursLabels.map((hour, idx) => (
                                      <text key={hour} x={getX(idx)} y={chartHeight} fill="#94a3b8" fontSize="12" fontWeight="bold" textAnchor="middle">
                                          {hour}h
                                      </text>
                                  ))}

                                  {/* Data Lines */}
                                  {hourlyLines.map((line, idx) => (
                                      <g key={idx}>
                                          {/* Glow Effect */}
                                          <path 
                                              d={generatePath(line.data)} 
                                              fill="none" 
                                              stroke={line.color} 
                                              strokeWidth="6" 
                                              strokeOpacity="0.2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                          />
                                          {/* The Line */}
                                          <path 
                                              d={generatePath(line.data)} 
                                              fill="none" 
                                              stroke={line.color} 
                                              strokeWidth="3" 
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              className="drop-shadow-md"
                                          />
                                          {/* The Dots */}
                                          {line.data.map((val, dIdx) => (
                                              <circle 
                                                key={dIdx} 
                                                cx={getX(dIdx)} 
                                                cy={getY(val)} 
                                                r={val > 0 ? 4 : 2} 
                                                fill="#0f172a" 
                                                stroke={line.color} 
                                                strokeWidth="2"
                                              />
                                          ))}
                                      </g>
                                  ))}
                              </svg>
                          )}
                      </div>

                      {/* LADO DIREITO: LEADERBOARD (LEGENDA GRANDE) */}
                      <div className="flex-[1] border-l border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-2 overflow-y-auto">
                          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-widest">Líderes de Hoje</h3>
                          {hourlyLines.length === 0 && <p className="text-slate-700 text-xs italic">Sem dados.</p>}
                          {hourlyLines.map((line, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700 shadow-sm relative overflow-hidden group">
                                  {/* Color Indicator Strip */}
                                  <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{backgroundColor: line.color}}></div>
                                  
                                  <div className="pl-2">
                                      <div className="text-sm font-bold text-white truncate max-w-[100px]">{line.technicianName}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                          {line.lastHourCount > 0 ? <span className="text-green-400 flex items-center gap-1">+{line.lastHourCount} na última hora</span> : <span>Estável</span>}
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-2xl font-black" style={{color: line.color}}>{line.totalToday}</div>
                                      <div className="text-[9px] text-slate-500 uppercase">Total</div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

              {/* Top 10 Volume */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl p-5 h-[40%] flex flex-col">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                     <CheckCircle size={24} className="text-blue-400" />
                     <h2 className="text-xl font-bold text-white uppercase tracking-wider">Volume Mensal (Top 10)</h2>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 overflow-y-auto pr-2">
                       {topOsMonth.map((tech, idx) => (
                           <div key={idx} className="flex items-center justify-between border-b border-slate-800/50 py-2 group hover:bg-slate-800/30 rounded px-2 transition-colors">
                               <div className="flex items-center gap-3 min-w-0">
                                   <span className="text-slate-600 font-mono text-sm w-5 shrink-0 font-bold group-hover:text-slate-400">{idx+1}.</span>
                                   <span className="text-slate-300 text-base font-medium truncate group-hover:text-white">{tech.technicianName}</span>
                               </div>
                               <div className="flex items-center gap-3 shrink-0">
                                   <div className="h-2.5 w-16 md:w-32 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                                       <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{width: `${Math.min(tech.totalOrders * 1.5, 100)}%`}}></div>
                                   </div>
                                   <span className="text-white font-bold text-lg w-8 text-right">{tech.totalOrders}</span>
                               </div>
                           </div>
                       ))}
                       {topOsMonth.length === 0 && <p className="col-span-2 text-center text-slate-600 py-10">Aguardando dados de fechamento...</p>}
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};