import { DirectusFile, Provider } from './provider.model';

export type EventStatus = 'published' | 'draft' | 'archived';
export type EventMode = 'single' | 'recurring';

export interface Area {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  latitude: number;
  longitude: number;
  status?: string;
  sort?: number;
}

export interface EventRecurring {
  days: string[]; // e.g. ['mon', 'wed', 'fri']
}

export interface EventCategory {
  value: string;
  label: string;
  emoji: string;
}

export const EVENT_CATEGORIES: EventCategory[] = [
  { value: 'live', label: 'Live Music & Shows', emoji: '🎶' },
  { value: 'food', label: 'Food & Specials', emoji: '🍽' },
  { value: 'excursions', label: 'Tours & Excursions', emoji: '🛶' },
  { value: 'wellness', label: 'Wellness & Spa', emoji: '💆' },
  { value: 'arts', label: 'Arts & Culture', emoji: '🎨' },
  { value: 'sports', label: 'Sports & Fitness', emoji: '⚽' },
  { value: 'personalized', label: 'Unique Experiences', emoji: '✨' },
  { value: 'celebrations', label: 'Parties & Celebrations', emoji: '🎉' },
  { value: 'other', label: 'Other Activities', emoji: '📌' },
];

export interface VamoEvent {
  id: string;
  status: EventStatus;
  mode?: EventMode;
  name: string;
  description?: string;
  category?: string;
  startDate?: string | null;
  endDate?: string | null;
  from?: string | null;
  to?: string | null;
  allDay?: boolean;
  openEnd?: boolean;
  recurring?: EventRecurring | string | null;
  isFree?: boolean;
  contactForPrice?: boolean;
  price?: number | string;
  currency?: 'USD' | 'DOP' | string;
  hasPromotion?: boolean;
  promoText?: string | null;
  promotion?: number | null;
  promotionStart?: string | null;
  location_point?: { type: 'Point'; coordinates: [number, number] } | null;
  address?: string | null;
  images?: { id?: number | string; events_id?: string; directus_files_id: DirectusFile | string }[];
  areas?: { id?: number; events_id?: string; areas_id: Area | string }[];
  provider?: Provider | string | null;
  is_main_banner?: boolean;
  is_whats_hot?: boolean;
  boost_expires_at?: string | null;
  boost_scheduled_start?: string | null;
  boost_scheduled_type?: 'main_banner' | 'whats_hot' | 'both' | null;
  addon_expires_at?: string | null;
  date_created?: string;
  date_updated?: string;
}

export interface ProviderEventStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
}
