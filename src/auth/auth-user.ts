export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** `google` or `azure` (Microsoft), as Supabase records it. */
  provider: string | null;
}

export interface IdentityProfile {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: Record<string, unknown>;
}

export function toAuthUser(
  user: IdentityProfile,
  provider?: string | null,
): AuthUser {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: text(metadata.full_name) ?? text(metadata.name),
    avatarUrl: text(metadata.avatar_url) ?? text(metadata.picture),
    provider: provider ?? user.app_metadata?.provider ?? null,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
