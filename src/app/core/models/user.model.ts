import { DirectusUser } from '@directus/sdk';
import { Provider } from './provider.model';

export interface VamoUser extends DirectusUser {
  provider_link?: Provider | null;
  area?: {
    id: string;
    name?: string;
    emoji?: string;
  } | null;
}
