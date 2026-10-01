import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  directusUrl: string;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isAllowedApiUrl(value: string, allowedHosts: string[] = environment.allowedHosts): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    return allowedHosts.some((base) => host === base || host.endsWith(`.${base}`));
  } catch {
    return false;
  }
}

let currentConfig: RuntimeConfig = {
  directusUrl: stripTrailingSlash(environment.directusUrl),
};

export const runtimeConfig = {
  get directusUrl(): string {
    return currentConfig.directusUrl;
  },
  setDirectusUrl(url: string): void {
    if (isAllowedApiUrl(url)) {
      currentConfig.directusUrl = stripTrailingSlash(url);
    }
  },
};
