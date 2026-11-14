import './load-env.js';
import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cookies: { secret: process.env.COOKIE_SECRET },
  });
  const config = app.get(ConfigService);
  const appUrl = config.getOrThrow<string>('APP_URL');
  const frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  const port = config.getOrThrow<number>('PORT');

  if (
    config.getOrThrow<string>('NODE_ENV') === 'production' &&
    appUrl.includes('localhost')
  ) {
    Logger.warn('APP_URL still points at localhost', 'Bootstrap');
  }

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Orchast API')
    .setDescription(
      'Accounts are created the first time someone signs in with Google or Microsoft. There is no email and password sign-in. After the browser flow, session cookies authenticate requests to this host. Other clients send Authorization: Bearer.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, swaggerConfig),
    {
      customSiteTitle: 'Orchast API',
      swaggerOptions: { persistAuthorization: true },
    },
  );

  await app.listen(port);
  Logger.log(`Listening on ${appUrl}`, 'Bootstrap');
  Logger.log(`Swagger UI at ${appUrl}/docs`, 'Bootstrap');
}

await bootstrap();
