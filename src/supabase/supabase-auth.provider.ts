import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import { toAuthUser, type AuthUser } from '../auth/auth-user.js';

/**
 * Verifies Supabase access tokens from their published keys. The secret key
 * is not required to know who is calling.
 */
@Injectable()
export class SupabaseAuth extends JwtBearerProvider<AuthUser> {
  constructor(registry: AuthenticationRegistry, config: ConfigService) {
    const url = config.getOrThrow<string>('SUPABASE_URL');
    const issuer = `${url}/auth/v1`;
    const audience = 'authenticated';
    const legacySecret = config.get<string>('SUPABASE_JWT_SECRET');
    super(
      legacySecret
        ? { key: legacySecret, issuer, audience, clockTolerance: '30s' }
        : {
            jwks: `${url}/auth/v1/.well-known/jwks.json`,
            issuer,
            audience,
            clockTolerance: '30s',
          },
    );
    registry.registerProvider(this);
  }

  validate(claims: JwtClaims): AuthUser | null {
    if (!claims.sub) {
      return null;
    }
    const metadata = record(claims.user_metadata);
    const app = record(claims.app_metadata);
    return toAuthUser({
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      user_metadata: metadata,
      app_metadata: {
        provider: typeof app.provider === 'string' ? app.provider : undefined,
      },
    });
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
