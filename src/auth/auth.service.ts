import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toAuthUser, type AuthUser } from './auth-user.js';
import {
  buildAuthorizeUrl,
  createPkcePair,
  isNewRegistration,
  type OAuthProvider,
  type OAuthTransaction,
} from './oauth.js';
import { SupabaseService } from '../supabase/supabase.service.js';

export interface StartedOAuth {
  url: string;
  transaction: OAuthTransaction;
}

export interface SignedInSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  private readonly supabaseUrl: string;
  private readonly appUrl: string;
  private readonly frontendUrl: string;

  constructor(
    config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.appUrl = config.getOrThrow<string>('APP_URL');
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  start(provider: OAuthProvider): StartedOAuth {
    const { verifier, challenge } = createPkcePair();
    return {
      transaction: { verifier, provider },
      url: buildAuthorizeUrl({
        supabaseUrl: this.supabaseUrl,
        provider,
        redirectTo: `${this.appUrl}/auth/callback`,
        challenge,
      }),
    };
  }

  async complete(
    code: string,
    transaction: OAuthTransaction,
  ): Promise<SignedInSession> {
    const session = await this.supabase.exchangeCode(
      code,
      transaction.verifier,
    );
    await this.supabase.saveProfile(session.user, transaction.provider);
    return this.toSession(
      session.access_token,
      session.refresh_token,
      session.expires_in,
      session.user,
      transaction.provider,
    );
  }

  async refresh(refreshToken: string | undefined): Promise<SignedInSession> {
    if (!refreshToken) {
      throw new UnauthorizedException('Sign in again.');
    }
    const session = await this.supabase.refresh(refreshToken);
    const provider = session.user.app_metadata?.provider ?? null;
    return this.toSession(
      session.access_token,
      session.refresh_token,
      session.expires_in,
      session.user,
      provider,
    );
  }

  signOut(accessToken: string | undefined): Promise<void> {
    return accessToken ? this.supabase.revoke(accessToken) : Promise.resolve();
  }

  frontendRedirect(params: Record<string, string>): string {
    const target = new URL('/auth/callback', this.frontendUrl);
    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, value);
    }
    return target.toString();
  }

  private toSession(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    user: Parameters<typeof toAuthUser>[0],
    provider: string | null,
  ): SignedInSession {
    return {
      accessToken,
      refreshToken,
      expiresIn,
      isNewUser: isNewRegistration(user),
      user: toAuthUser(user, provider),
    };
  }
}
