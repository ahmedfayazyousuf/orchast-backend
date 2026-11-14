import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      cookies: { secret: process.env.COOKIE_SECRET },
    });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('GET /health is public', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /auth/providers lists Google and Microsoft', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/providers')
      .expect(200);
    expect(response.body.providers).toEqual([
      { id: 'google', label: 'Google' },
      { id: 'microsoft', label: 'Microsoft' },
    ]);
  });

  it('GET /auth/me rejects a caller with no session', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/google redirects to Supabase and remembers the PKCE verifier', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);
    expect(response.headers.location).toContain(
      'https://example.supabase.co/auth/v1/authorize?',
    );
    expect(response.headers.location).toContain('provider=google');
    expect(response.headers.location).toContain('code_challenge=');
    expect(cookieHeader(response.headers['set-cookie'])).toContain(
      'orchast_oauth=',
    );
  });

  it('GET /auth/microsoft asks Supabase for Azure', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/microsoft')
      .expect(302);
    expect(response.headers.location).toContain('provider=azure');
  });

  it('GET /auth/google?format=json returns the authorize URL', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google?format=json')
      .expect(200);
    expect(response.body.provider).toBe('google');
    expect(response.body.url).toContain('provider=google');
  });

  it('rejects an unknown response format', () => {
    return request(app.getHttpServer())
      .get('/auth/google?format=popup')
      .expect(400);
  });

  it('GET /auth/callback without the verifier cookie does not call Supabase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await request(app.getHttpServer())
      .get('/auth/callback?code=abc')
      .expect(302);
    expect(response.headers.location).toBe(
      'http://localhost:1818/auth/callback?status=error&error=sign_in_failed',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exchanges the code with the verifier from the cookie and sends the browser home', async () => {
    const started = await request(app.getHttpServer())
      .get('/auth/google?format=json')
      .expect(200);
    const createdAt = '2026-11-14T12:00:00.000Z';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.includes('/auth/v1/token')) {
          return Response.json({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            user: {
              id: 'user-1',
              email: 'ada@example.com',
              created_at: createdAt,
              last_sign_in_at: createdAt,
              app_metadata: { provider: 'google' },
              user_metadata: {
                full_name: 'Ada Lovelace',
                avatar_url: 'https://example.com/ada.png',
              },
            },
          });
        }
        return Response.json(
          { message: 'profiles table is not created in this test' },
          { status: 404 },
        );
      });

    const response = await request(app.getHttpServer())
      .get('/auth/callback?code=auth-code')
      .set('Cookie', cookieHeader(started.headers['set-cookie']))
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:1818/auth/callback?status=success&isNewUser=true',
    );
    const cookies = cookieHeader(response.headers['set-cookie']);
    expect(cookies).toContain('orchast_access=access-token');
    expect(cookies).toContain('orchast_refresh=refresh-token');

    const tokenCall = fetchSpy.mock.calls.find((call) =>
      requestUrl(call[0]).includes('/auth/v1/token'),
    );
    expect(tokenCall).toBeDefined();
    const body = tokenCall?.[1]?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '')).toMatchObject({
      auth_code: 'auth-code',
      code_verifier: expect.any(String),
    });
  });
});

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return list.map((value) => value.split(';')[0]).join('; ');
}
