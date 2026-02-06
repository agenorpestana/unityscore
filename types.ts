export interface Permission {
  canManageCompany: boolean;
  canManageUsers: boolean;
  canViewScore: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Optional for display security
  role: 'saas_owner' | 'super_admin' | 'admin' | 'user'; // Added 'saas_owner'
  permissions: Permission;
  active: boolean;
  companyId?: string; // Link to tenant
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