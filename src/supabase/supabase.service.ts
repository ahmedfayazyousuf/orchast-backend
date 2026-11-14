import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IdentityProfile } from '../auth/auth-user.js';

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: IdentityProfile;
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly url: string;
  private readonly publishableKey: string;
  private readonly admin: SupabaseClient;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('SUPABASE_URL');
    this.publishableKey = config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
    this.admin = createClient(
      this.url,
      config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  exchangeCode(code: string, verifier: string): Promise<GoTrueSession> {
    return this.requestToken('pkce', {
      auth_code: code,
      code_verifier: verifier,
    });
  }

  refresh(refreshToken: string): Promise<GoTrueSession> {
    return this.requestToken('refresh_token', { refresh_token: refreshToken });
  }

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!response.ok) {
        this.logger.warn(`Supabase logout returned ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(
        `Supabase logout failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /**
   * Stores a profile row for the signed-in user. Sign-in still succeeds when
   * the table has not been created yet.
   */
  async saveProfile(user: IdentityProfile, provider: string): Promise<void> {
    const metadata = user.user_metadata ?? {};
    const { error } = await this.admin.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: text(metadata.full_name) ?? text(metadata.name),
        avatar_url: text(metadata.avatar_url) ?? text(metadata.picture),
        provider,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) {
      this.logger.warn(
        `Profile was not saved (${error.code ?? 'unknown'}). Run supabase/migrations in the SQL editor.`,
      );
    }
  }

  private async requestToken(
    grantType: 'pkce' | 'refresh_token',
    body: Record<string, string>,
  ): Promise<GoTrueSession> {
    let response: Response;
    try {
      response = await fetch(
        `${this.url}/auth/v1/token?grant_type=${grantType}`,
        {
          method: 'POST',
          headers: {
            apikey: this.publishableKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
    } catch (error) {
      this.logger.error(
        `Supabase Auth is unreachable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new BadGatewayException('Authentication service is unavailable');
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isSession(payload)) {
      this.logger.warn(
        `Supabase token request failed (${response.status}) ${errorText(payload)}`,
      );
      throw new UnauthorizedException('Sign-in failed. Start again.');
    }
    return payload;
  }
}

function isSession(value: unknown): value is GoTrueSession {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const session = value as Partial<GoTrueSession>;
  return (
    typeof session.access_token === 'string' &&
    typeof session.refresh_token === 'string' &&
    typeof session.expires_in === 'number' &&
    !!session.user &&
    typeof session.user.id === 'string'
  );
}

function errorText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const body = value as {
    error_description?: unknown;
    msg?: unknown;
    error?: unknown;
  };
  const message = body.error_description ?? body.msg ?? body.error;
  return typeof message === 'string' ? message : '';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
