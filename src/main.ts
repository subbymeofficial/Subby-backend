import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { runWelcomeBackfill } from './scripts/backfill-welcome';
import { setDefaultResultOrder } from 'dns';

// Railway's egress has no IPv6 route; prefer IPv4 so Gmail SMTP
// connects immediately instead of hanging on IPv6 timeouts.
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';
  const port = configService.get<number>('port') || 3001;
  const corsOrigins = configService.get<string[]>('cors.origins') || ['http://localhost:5173'];

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  if (process.env.RUN_WELCOME_BACKFILL === 'true') {
    runWelcomeBackfill(app).catch((err) =>
      console.error('[WelcomeBackfill] failed:', err),
    );
  }

  await app.listen(port);
  console.log(`SubbyMe API running on: http://localhost:${port}/${apiPrefix}`);
  console.log(`Socket.io chat namespace: ws://localhost:${port}/chat`);
}

bootstrap();
