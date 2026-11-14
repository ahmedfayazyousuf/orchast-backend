import { Injectable } from '@nestjs/common';
import type { CookieSerializeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { OAuthTransaction } from './oauth.js';

export const ACCESS_COOKIE = 'orchast_access';
export const REFRESH_COOKIE = 'orchast_refresh';
export const OAUTH_COOKIE = 'orchast_oauth';

const AUTH_PATH = '/auth';
const OAUTH_MAX_AGE_SECONDS = 10 * 60;
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionCookies {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthCookies {
  private readonly secure: boolean;
  private readonly domain?: string;

  constructor(
    private readonly http: HttpAdapterHost,
    config: ConfigService,
  ) {
    const appUrl = new URL(config.getOrThrow<string>('APP_URL'));
    this.secure =
      appUrl.protocol === 'https:' ||
      appUrl.hostname === 'localhost' ||
      appUrl.hostname === '127.0.0.1';
    this.domain = config.get<string>('COOKIE_DOMAIN');
  }

  writeTransaction(response: unknown, transaction: OAuthTransaction): void {
    this.set(response, OAUTH_COOKIE, JSON.stringify(transaction), {
      path: AUTH_PATH,
      maxAge: OAUTH_MAX_AGE_SECONDS,
      signed: true,
    });
  }

  writeSession(response: unknown, session: SessionCookies): void {
    this.set(response, ACCESS_COOKIE, session.accessToken, {
      path: '/',
      maxAge: Math.max(1, session.expiresIn),
    });
    this.set(response, REFRESH_COOKIE, session.refreshToken, {
      path: AUTH_PATH,
      maxAge: REFRESH_MAX_AGE_SECONDS,
    });
  }

  clearTransaction(response: unknown): void {
    this.clear(response, OAUTH_COOKIE, AUTH_PATH);
  }

  clearSession(response: unknown): void {
    this.clear(response, ACCESS_COOKIE, '/');
    this.clear(response, REFRESH_COOKIE, AUTH_PATH);
    this.clear(response, OAUTH_COOKIE, AUTH_PATH);
  }

  private set(
    response: unknown,
    name: string,
    value: string,
    options: CookieSerializeOptions,
  ): void {
    const adapter = this.http.httpAdapter;
    if (typeof adapter.setCookie !== 'function') {
      throw new Error('This HTTP adapter cannot set cookies');
    }
    adapter.setCookie(response, name, value, this.attributes(options));
  }

  private clear(response: unknown, name: string, path: string): void {
    const adapter = this.http.httpAdapter;
    if (typeof adapter.clearCookie !== 'function') {
      throw new Error('This HTTP adapter cannot clear cookies');
    }
    adapter.clearCookie(response, name, this.attributes({ path }));
  }

  private attributes(options: CookieSerializeOptions): CookieSerializeOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      ...(this.domain ? { domain: this.domain } : {}),
      ...options,
    };
  }
}
