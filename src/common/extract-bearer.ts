export function extractBearerToken(authorization?: string): string | null {
  const match = authorization?.match(/^Bearer (.+)$/);
  return match?.[1] ?? null;
}
