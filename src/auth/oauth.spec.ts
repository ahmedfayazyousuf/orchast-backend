import { createHash } from 'node:crypto';
import {
  buildAuthorizeUrl,
  createPkcePair,
  isNewRegistration,
  parseTransaction,
  readCookie,
  toSupabaseProvider,
} from './oauth.js';

describe('oauth helpers', () => {
  it('maps Microsoft to the Supabase Azure provider', () => {
    expect(toSupabaseProvider('microsoft')).toBe('azure');
    expect(toSupabaseProvider('google')).toBe('google');
  });

  it('builds an S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
  });

  it('sends the browser to Supabase with the challenge and our callback', () => {
    const url = new URL(
      buildAuthorizeUrl({
        supabaseUrl: 'https://example.supabase.co',
        provider: 'microsoft',
        redirectTo: 'http://localhost:1918/auth/callback',
        challenge: 'challenge',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://example.supabase.co/auth/v1/authorize',
    );
    expect(url.searchParams.get('provider')).toBe('azure');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('redirect_to')).toBe(
      'http://localhost:1918/auth/callback',
    );
    expect(url.searchParams.get('scopes')).toContain('email');
  });

  it('treats the first sign-in as registration', () => {
    const created = '2026-11-14T12:00:00.000Z';
    expect(
      isNewRegistration({ created_at: created, last_sign_in_at: created }),
    ).toBe(true);
    expect(
      isNewRegistration({
        created_at: created,
        last_sign_in_at: '2026-11-14T12:00:05.000Z',
      }),
    ).toBe(true);
    expect(
      isNewRegistration({
        created_at: created,
        last_sign_in_at: '2026-11-14T13:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('rejects a transaction cookie that was not written by this API', () => {
    expect(parseTransaction(undefined)).toBeNull();
    expect(parseTransaction('not-json')).toBeNull();
    expect(
      parseTransaction(JSON.stringify({ verifier: 'x', provider: 'github' })),
    ).toBeNull();
    expect(
      parseTransaction(
        JSON.stringify({ verifier: 'a'.repeat(32), provider: 'google' }),
      ),
    ).toEqual({
      verifier: 'a'.repeat(32),
      provider: 'google',
    });
  });

  it('reads one cookie from a header', () => {
    expect(readCookie('orchast_access=abc; other=1', 'orchast_access')).toBe(
      'abc',
    );
    expect(readCookie('theme=dark', 'orchast_access')).toBeUndefined();
  });
});
