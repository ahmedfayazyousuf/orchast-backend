import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ACCESS_COOKIE } from './auth-cookies.js';
import { readCookie } from './oauth.js';

/**
 * Promotes the httpOnly session cookie to a bearer token so the
 * authentication guard can verify it. An explicit Authorization header wins.
 */
@Injectable()
export class AccessTokenCookieMiddleware implements NestMiddleware {
  use(
    request: { headers: { authorization?: string; cookie?: string } },
    _response: unknown,
    next: () => void,
  ): void {
    if (!request.headers.authorization) {
      const token = readCookie(request.headers.cookie, ACCESS_COOKIE);
      if (token) {
        request.headers.authorization = `Bearer ${token}`;
      }
    }
    next();
  }
}
