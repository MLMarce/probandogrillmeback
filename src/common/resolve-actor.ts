import { SupabaseService } from '../supabase/supabase.service';
import { extractBearerToken } from './extract-bearer';

export async function resolveActor(
  supabase: SupabaseService,
  authorization?: string,
): Promise<string | null> {
  const token = extractBearerToken(authorization);
  if (!token) return null;
  const user = await supabase.getUser(token);
  return user.email ?? null;
}
