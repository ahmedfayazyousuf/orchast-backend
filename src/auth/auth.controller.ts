import {
  Body,
  Controller,
  Cookies,
  Get,
  Headers,
  Logger,
  Post,
  Query,
  Res,
  SignedCookies,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '@nestjs/authentication';
import type { Response } from 'express';
import {
  ACCESS_COOKIE,
  AuthCookies,
  OAUTH_COOKIE,
  REFRESH_COOKIE,
} from './auth-cookies.js';
import {
  callbackQuerySchema,
  refreshBodySchema,
  startQuerySchema,
} from './auth.schemas.js';
import type { CallbackQuery, RefreshBody, StartQuery } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth-user.js';
import {
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDERS,
  parseTransaction,
  type OAuthProvider,
} from './oauth.js';

class AuthUserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  fullName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'google' })
  provider!: string | null;
}

class OAuthStartResponse {
  @ApiProperty()
  url!: string;

  @ApiProperty({ enum: OAUTH_PROVIDERS })
  provider!: OAuthProvider;
}

class ProviderOptionResponse {
  @ApiProperty({ enum: OAUTH_PROVIDERS })
  id!: OAuthProvider;

  @ApiProperty({ example: 'Google' })
  label!: string;
}

class ProviderListResponse {
  @ApiProperty({ type: [ProviderOptionResponse] })
  providers!: ProviderOptionResponse[];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
  ) {}

  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'List the sign-in providers',
    description:
      'Google and Microsoft only. The first successful sign-in registers the account.',
  })
  @ApiOkResponse({ type: ProviderListResponse })
  providers(): ProviderListResponse {
    return {
      providers: OAUTH_PROVIDERS.map((id) => ({
        id,
        label: OAUTH_PROVIDER_LABELS[id],
      })),
    };
  }

  @Public()
  @Get('google')
  @ApiOperation({
    summary: 'Register or sign in with Google',
    description:
      'Redirects to Google. Add ?format=json to receive the URL instead, which is what Swagger and the web app use. A first visit creates the Supabase user.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google.' })
  @ApiOkResponse({
    type: OAuthStartResponse,
    description: 'Authorize URL, when format=json.',
  })
  google(
    @Query({ schema: startQuerySchema }) query: StartQuery,
    @Res() response: Response,
  ): void {
    this.begin('google', query, response);
  }

  @Public()
  @Get('microsoft')
  @ApiOperation({
    summary: 'Register or sign in with Microsoft',
    description: 'Same flow as Google. Supabase calls this provider Azure.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Microsoft.' })
  @ApiOkResponse({
    type: OAuthStartResponse,
    description: 'Authorize URL, when format=json.',
  })
  microsoft(
    @Query({ schema: startQuerySchema }) query: StartQuery,
    @Res() response: Response,
  ): void {
    this.begin('microsoft', query, response);
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'Finish Google or Microsoft sign-in',
    description:
      'Supabase redirects the browser here. The API exchanges the code, stores the session in httpOnly cookies, and sends the browser to the web app.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to the web app auth callback.',
  })
  async callback(
    @Query({ schema: callbackQuerySchema }) query: CallbackQuery,
    @SignedCookies(OAUTH_COOKIE) transactionCookie: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (query.error) {
      this.logger.warn(`OAuth provider returned ${query.error}`);
      this.cookies.clearTransaction(response);
      this.redirect(response, {
        status: 'error',
        error: query.error === 'access_denied' ? 'cancelled' : 'sign_in_failed',
      });
      return;
    }

    const transaction = parseTransaction(transactionCookie);
    if (!query.code || !transaction) {
      this.cookies.clearTransaction(response);
      this.redirect(response, { status: 'error', error: 'sign_in_failed' });
      return;
    }

    try {
      const session = await this.auth.complete(query.code, transaction);
      this.cookies.writeSession(response, session);
      this.cookies.clearTransaction(response);
      this.redirect(response, {
        status: 'success',
        isNewUser: session.isNewUser ? 'true' : 'false',
      });
    } catch (error) {
      this.logger.warn(
        `OAuth callback failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      this.cookies.clearTransaction(response);
      this.redirect(response, { status: 'error', error: 'sign_in_failed' });
    }
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Read the signed-in user' })
  @ApiOkResponse({
    type: AuthUserResponse,
    description: 'The user in the access token.',
  })
  me(@CurrentUser() user: AuthUser): AuthUserResponse {
    return user;
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh the session',
    description:
      'Reads the httpOnly refresh cookie, or a refreshToken in the body for a non-browser client. The body form also returns the rotated refresh token.',
  })
  async refresh(
    @Body({ schema: refreshBodySchema }) body: RefreshBody,
    @Cookies(REFRESH_COOKIE) refreshCookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(body.refreshToken ?? refreshCookie);
    this.cookies.writeSession(response, session);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
      ...(body.refreshToken ? { refreshToken: session.refreshToken } : {}),
    };
  }

  @Public()
  @Post('sign-out')
  @ApiOperation({ summary: 'Sign out and clear the session cookies' })
  async signOut(
    @Headers('authorization') authorization: string | undefined,
    @Cookies(ACCESS_COOKIE) accessCookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ signedOut: true }> {
    const headerToken = authorization?.replace(/^Bearer\s+/i, '');
    await this.auth.signOut(headerToken || accessCookie);
    this.cookies.clearSession(response);
    return { signedOut: true };
  }

  private begin(
    provider: OAuthProvider,
    query: StartQuery,
    response: Response,
  ): void {
    const started = this.auth.start(provider);
    this.cookies.writeTransaction(response, started.transaction);
    if (query.format === 'json') {
      const body: OAuthStartResponse = { url: started.url, provider };
      response.json(body);
      return;
    }
    response.redirect(302, started.url);
  }

  private redirect(response: Response, params: Record<string, string>): void {
    response.redirect(302, this.auth.frontendRedirect(params));
  }
}
