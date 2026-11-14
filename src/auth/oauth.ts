import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const OAUTH_PROVIDERS = ['google', 'microsoft'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

const transactionSchema = z.object({
  verifier: z.string().min(20),
  provider: z.enum(OAUTH_PROVIDERS),
});

export type OAuthTransaction = z.infer<typeof transactionSchema>;

/** First sign-in is registration. Supabase stamps both times together. */
const NEW_ACCOUNT_WINDOW_MS = 15_000;

export function toSupabaseProvider(
  provider: OAuthProvider,
): 'google' | 'azure' {
  return provider === 'microsoft' ? 'azure' : 'google';
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(input: {
  supabaseUrl: string;
  provider: OAuthProvider;
  redirectTo: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    provider: toSupabaseProvider(input.provider),
    redirect_to: input.redirectTo,
    scopes: 'openid email profile',
    code_challenge: input.challenge,
    code_challenge_method: 's256',
    prompt: 'select_account',
  });
  return `${input.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
}

export function parseTransaction(
  raw: string | undefined,
): OAuthTransaction | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = transactionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isNewRegistration(user: {
  created_at?: string;
  last_sign_in_at?: string | null;
}): boolean {
  if (!user.created_at || !user.last_sign_in_at) {
    return false;
  }
  const created = Date.parse(user.created_at);
  const signedIn = Date.parse(user.last_sign_in_at);
  if (Number.isNaN(created) || Number.isNaN(signedIn)) {
    return false;
  }
  return Math.abs(signedIn - created) < NEW_ACCOUNT_WINDOW_MS;
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
