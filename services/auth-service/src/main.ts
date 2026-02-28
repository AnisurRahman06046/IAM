import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { seedRegistrationConfigs } from './database/seeds/registration-config.seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(helmet());

  // SECURITY: Restrict CORS to known origins
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3002,http://localhost:5173').split(',');
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // SECURITY: Limit request body size
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // SECURITY: Only expose Swagger in non-production environments
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Central IAM Auth Service')
      .setDescription('Centralized IAM Auth Service API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Run seeds
  const dataSource = app.get(DataSource);
  await seedRegistrationConfigs(dataSource);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  logger.log(`Auth service running on http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
