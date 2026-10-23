import { UnauthorizedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: SupabaseUser;
}

@Injectable()
export class SupabaseService {
  private get baseUrl(): string {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error('SUPABASE_URL no configurada');
    return url;
  }

  private get serviceKey(): string {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
    return key;
  }

  private authHeaders(accessToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: this.serviceKey,
      'Content-Type': 'application/json',
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return headers;
  }

  async signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
    const res = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return (await res.json()) as SupabaseSession;
  }

  async getUser(accessToken: string): Promise<SupabaseUser> {
    const res = await fetch(`${this.baseUrl}/auth/v1/user`, {
      headers: this.authHeaders(accessToken),
    });
    if (!res.ok) {
      throw new UnauthorizedException('Sesión inválida');
    }
    return (await res.json()) as SupabaseUser;
  }

  async signOut(accessToken: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
    });
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      throw new UnauthorizedException('No se pudo cerrar la sesión');
    }
  }

  async requestRecovery(email: string): Promise<void> {
    await fetch(`${this.baseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ email }),
    });
  }

  async createAccount(email: string, password: string): Promise<SupabaseUser> {
    const res = await fetch(`${this.baseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: this.authHeaders(this.serviceKey),
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!res.ok) {
      const body = (await res.text()) || res.statusText;
      throw new Error(
        `No se pudo crear la cuenta de Administrador de RRHH (${res.status}): ${body}`,
      );
    }
    return (await res.json()) as SupabaseUser;
  }
}
