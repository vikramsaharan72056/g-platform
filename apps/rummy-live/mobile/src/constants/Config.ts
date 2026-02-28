const rawApiUrl = process.env.EXPO_PUBLIC_RUMMY_API_URL || 'http://localhost:3400';

export const API_URL = rawApiUrl.replace(/\/+$/, '');
