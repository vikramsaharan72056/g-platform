const env = (globalThis as any)?.process?.env as Record<string, string | undefined> | undefined;
const rawApiUrl = env?.EXPO_PUBLIC_AVIATOR_API_URL || 'http://localhost:3501';

export const API_URL = rawApiUrl.replace(/\/+$/, '');
