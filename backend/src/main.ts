import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Security Headers (Helmet)
  app.use(helmet());

  // 2. Cross-Origin Resource Sharing (CORS)
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // 3. Global API Routing Prefix
  app.setGlobalPrefix('api/v1');

  // 4. Global Validation Pipeline
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 5. OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Gujarat Police Unified CCTV Intelligence Platform — API')
    .setDescription('REST API Specification for CCTV Federation, AI Intelligence, and Command Control')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'System health and infrastructure diagnostics')
    .addTag('Auth', 'Authentication, session refresh, and user profile')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 6. Start HTTP Server
  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`================================================================`);
  logger.log(` Unified CCTV Intelligence Platform — Backend Initialized`);
  logger.log(` Application listening on: http://localhost:${port}/api/v1`);
  logger.log(` Swagger Documentation:   http://localhost:${port}/api/docs`);
  logger.log(` Health Check Endpoint:   http://localhost:${port}/api/v1/health`);
  logger.log(`================================================================`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap failure:', err);
  process.exit(1);
});
