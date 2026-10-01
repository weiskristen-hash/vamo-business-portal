import { authentication, createDirectus, rest } from '@directus/sdk';
import { runtimeConfig } from '../config/runtime-config';
import { createBrowserAuthStorage } from './browser-auth.storage';
import { VamoUser } from '../models/user.model';
import { Provider } from '../models/provider.model';
import { VamoEvent, Area } from '../models/event.model';

export interface VamoSchema {
  directus_users: VamoUser[];
  providers: Provider[];
  events: VamoEvent[];
  areas: Area[];
}

export const directusClient = createDirectus<VamoSchema>(runtimeConfig.directusUrl)
  .with(rest({ credentials: 'include' }))
  .with(
    authentication('json', {
      storage: createBrowserAuthStorage(),
      autoRefresh: false,
    })
  );

export function syncDirectusBaseUrl(): void {
  try {
    directusClient.url = new URL(runtimeConfig.directusUrl);
  } catch (err) {
    console.warn('[DirectusClient] Invalid URL in syncDirectusBaseUrl:', err);
  }
}
