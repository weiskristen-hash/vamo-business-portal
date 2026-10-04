export interface DirectusFile {
  id: string;
  storage?: string;
  filename_disk?: string;
  filename_download?: string;
  title?: string;
  type?: string;
  folder?: string | null;
  uploaded_by?: string;
  uploaded_on?: string;
  modified_by?: string | null;
  modified_on?: string | null;
  charset?: string | null;
  filesize?: number | string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  embed?: any;
  description?: string | null;
  location?: string | null;
  tags?: string[] | null;
  metadata?: any;
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface OpeningHour {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  opens_at: string;
  closes_at: string;
  break_from?: string;
  break_to?: string;
  closed: boolean;
}

export interface Provider {
  id: string;
  status?: string;
  sort?: number | null;
  user_created?: string;
  date_created?: string;
  user_updated?: string | null;
  date_updated?: string | null;
  name: string;
  description?: string;
  website?: string;
  address?: string;
  email?: string;
  location?: GeoJsonPoint | null;
  logo?: DirectusFile | string | null;
  business_type?: string;
  offerings?: string[];
  opening_times?: OpeningHour[];
  city?: string;
  facebook?: string;
  instagram?: string;
  google_business_link?: string;
  wa_number?: string;
  phone?: string;
  images?: { directus_files_id: DirectusFile | string }[];
  subscription_tier?: 'starter' | 'basic' | 'advanced' | null;
  bookmarkCount?: number;
}

export const BUSINESS_TYPES = [
  { value: 'restaurant_and_bar', label: 'Restaurant & Bar' },
  { value: 'restaurant',         label: 'Restaurant' },
  { value: 'bar',                label: 'Bar' },
  { value: 'disco_club',         label: 'Disco / Club' },
  { value: 'bakery',             label: 'Bakery / Café' },
  { value: 'wellness',           label: 'Wellness & Spa' },
  { value: 'car_rental',         label: 'Car Rental' },
  { value: 'excursions',         label: 'Excursions & Tours' },
  { value: 'sports',             label: 'Sports & Outdoor' },
  { value: 'shopping',           label: 'Shopping' },
  { value: 'hair-dresser',       label: 'Hair & Beauty' },
  { value: 'arts_and_culture',   label: 'Art & Culture' },
  { value: 'services',           label: 'Other Services' },
  { value: 'other',              label: 'Other' },
];
