import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SupabaseService, SupabaseSession } from '../supabase/supabase.service';
import { LoginResponse } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const session: SupabaseSession = await this.supabase.signInWithPassword(email, password);
    await this.audit.record('login', session.user.email ?? email, 'auth', {
      user_id: session.user.id,
    });
    return {
      access_token: session.access_token,
      token_type: session.token_type,
      user: { id: session.user.id, email: session.user.email },
    };
  }

  async logout(accessToken: string): Promise<void> {
    await this.supabase.signOut(accessToken);
  }

  async session(accessToken: string) {
    const user = await this.supabase.getUser(accessToken);
    if (!user) throw new UnauthorizedException('Sesión inválida');
    return { id: user.id, email: user.email };
  }

  async resetPassword(email: string): Promise<void> {
    await this.supabase.requestRecovery(email);
  }
}
