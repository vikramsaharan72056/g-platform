import { API_URL } from '../constants/Config';

export class ApiClient {
  private static token: string | null = null;

  static setToken(token: string | null) {
    this.token = token;
  }

  static async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  static async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private static async request<T>(path: string, options: RequestInit): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Request failed');
    }

    return result.data as T;
  }
}
