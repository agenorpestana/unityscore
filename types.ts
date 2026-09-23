
export interface Permission {
  canManageCompany?: boolean;
  canManageUsers?: boolean;
  canViewScore?: boolean;
  canAssignOS?: boolean;
  allowedTabs?: string[]; // ['dashboard', 'pontua', 'reports', 'users', 'settings', 'tv']
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Optional for display security
  role: 'saas_owner' | 'super_admin' | 'admin' | 'user' | 'employee'; // Added 'employee'
  permissions: Permission;
  active: boolean;
  companyId?: string; // Link to tenant
  ixcEmployeeId?: string; // Link to IXC Employee ID
  opaUserId?: string; // Compatibilidade legado Opa! Suite
  whaticketUserId?: string; // ID do Usuário/Atendente no Whaticket
}

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  address?: string;
  email?: string;
  email_contact?: string; // Mapeamento DB
  phone?: string;
  ixcDomain: string;
  ixcToken: string;
  useCorsProxy: boolean;
  logoUrl: string | null;
  status?: 'active' | 'inactive' | 'suspended';
  // Configurações Whaticket (WhatsApp)
  whaticketUrl?: string;
  whaticketToken?: string;
  whaticketDefaultUserId?: string;
  whaticketDefaultQueueId?: string;
  whaticketSendSignature?: boolean;
  whaticketCloseTicket?: boolean;
  whaticketFastSend?: boolean;
  // Compatibilidade legada Opa! Suite (opcional)
  opaSuiteUrl?: string;
  opaSuiteToken?: string;
  opaSuiteCanalId?: string;
  opaSuiteDefaultTemplateId?: string;
  opaSuiteDefaultDepartmentId?: string;
}

export interface WhaticketConnection {
  id: number | string;
  name: string;
  status: string;
  isDefault?: boolean;
  number?: string;
  channel?: string;
}

export interface WhaticketButton {
  text: string;
  id: string;
  queueId?: number | string;
  userId?: number | string;
}

export interface WhaticketSendPayload {
  number: string;
  body: string;
  userId?: string;
  queueId?: string;
  sendSignature?: boolean;
  closeTicket?: boolean;
  fastSend?: boolean;
  url?: string;
  caption?: string;
  buttons?: WhaticketButton[];
  footer?: string;
}

export interface WhaticketCheckNumberResult {
  existsInWhatsapp: boolean;
  number: string;
  numberFormatted?: string;
}

export interface OpaDepartment {
  _id: string;
  nome: string;
  descricao?: string;
  status?: string;
  ordem?: number;
  realizaAtendimento?: boolean;
}

export interface OpaChannel {
  _id: string;
  nome: string;
  id_atendente?: string;
  status?: string;
  canal?: string;
  integracao?: string;
  prioridadeListagemAtendimentos?: number;
}

export interface OpaUser {
  _id: string;
  nome: string;
  status?: string; // 'A' para ativo, 'I' para inativo
  tipo?: string; // 'user' ou 'bot'
  email?: string;
}

// Novos tipos para o SaaS Admin
export interface SaaSPlan {
  id: string;
  name: string;
  price: number;
  maxUsers: number; // Mapped from max_users in DB
  max_users?: number; // DB field name fallback
  active: boolean;
}

export interface SaaSCompany {
  id: string;
  name: string;
  cnpj: string;
  emailContact: string;
  email_contact?: string; // DB field fallback
  planId: string;
  plan_id?: string; // DB field fallback
  planName?: string; // Joined field
  status: 'active' | 'inactive' | 'suspended';
  expirationDate: string;
  expiration_date?: string; // DB field fallback
  ixcDomain?: string; // Para fins de debug do admin
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

// Existing types
export interface Technician {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  title: string;
}

export interface ScoreRule {
  subjectId: string;
  points: number;
  type: 'internal' | 'external' | 'both';
  allowSplit?: boolean; // New: Allows points splitting
}

export interface OsSplit {
  osId: string;
  technicianIds: string[]; // List of Tech IDs involved
}

export interface OsPenalty {
  id: number;
  osId: string;
  technicianId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ServiceOrder {
  id: string;
  technicianId: string;
  technicianName: string;
  clientId: string;
  clientName: string;
  subjectId: string;
  subjectName: string;
  openingDate: string;
  closingDate: string;
  reopeningDate?: string;
  status: 'Aberto' | 'Fechado' | 'Em Andamento';
}

export interface OsAssignment {
  id?: number;
  osId: string;
  userId?: string;
  technicianId?: string;
  assignedName?: string;
  assignedBy?: string;
  createdAt?: string;
}

export interface OpaCliente {
  _id: string;
  nome: string;
  fantasia?: string;
  cpf_cnpj?: string;
  status?: string;
  prospect?: boolean;
  cliente?: boolean;
  fornecedor?: boolean;
  prestadorServico?: boolean;
}

export interface OpaTemplate {
  _id: string;
  texto: string;
  atalho: string;
  tipo_mensagem?: string;
  departamentos?: string[];
}

export interface SystemTabItem {
  id: string;
  label: string;
  description: string;
}

export const SYSTEM_TABS: SystemTabItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Visão geral das ordens de serviço e indicadores' },
  { id: 'pontua', label: 'Pontua', description: 'Regras de pontuação e ranking de técnicos' },
  { id: 'reports', label: 'Relatórios', description: 'Relatórios por funcionário e por assunto' },
  { id: 'users', label: 'Usuários', description: 'Gestão de usuários, técnicos e permissões' },
  { id: 'settings', label: 'Configurações', description: 'Dados da empresa, IXC Soft e Opa! Suite' },
  { id: 'tv', label: 'Modo TV / Painel', description: 'Visualização de telão em tempo real para o time' }
];

export const isTabAllowed = (user: User | null | undefined, tabId: string): boolean => {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'saas_owner') return true;

  const allowed = user.permissions?.allowedTabs;
  if (Array.isArray(allowed)) {
    return allowed.includes(tabId);
  }

  // Fallback para usuários cadastrados antes da migration de allowedTabs:
  if (user.role === 'admin') return true;
  if (user.role === 'user') {
    if (tabId === 'dashboard' || tabId === 'pontua' || tabId === 'reports' || tabId === 'tv') return true;
    if (tabId === 'users') return Boolean(user.permissions?.canManageUsers);
    if (tabId === 'settings') return Boolean(user.permissions?.canManageCompany);
    return false;
  }
  if (user.role === 'employee') {
    return tabId === 'dashboard' || tabId === 'pontua' || tabId === 'reports';
  }
  return false;
};


