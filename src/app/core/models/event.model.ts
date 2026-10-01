import { DirectusFile, Provider } from './provider.model';

export type EventStatus = 'published' | 'draft' | 'archived';
export type EventMode = 'single' | 'recurring';

export interface VamoEvent {
  id: string;
  status: EventStatus;
  mode?: EventMode;
  name: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  from?: string | null;
  to?: string | null;
  recurring?: string[] | string | null;
  allDay?: boolean;
  images?: { id?: string; directus_files_id: DirectusFile | string }[];
  provider?: Provider | string | null;
  is_main_banner?: boolean;
  is_whats_hot?: boolean;
  date_created?: string;
  date_updated?: string;
}

export interface ProviderEventStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
}
