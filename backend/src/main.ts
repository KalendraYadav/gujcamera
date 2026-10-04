import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { OnvifProtocolTestFixture } from './modules/cameras/fixtures/onvif-protocol.fixture';

import { createCorsOptions } from './common/config/cors.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // 2. Cross-Origin Resource Sharing (CORS)
  app.enableCors(createCorsOptions(process.env.CORS_ORIGINS));

  // 3. Native WebSocket Adapter (master_architecture.md WS /ws/alerts)
  app.useWebSocketAdapter(new WsAdapter(app));

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
  await app.listen(port, '0.0.0.0');

  // 7. Demo ONVIF Device Service in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    try {
      const demoOnvifPort = parseInt(process.env.DEMO_ONVIF_PORT || '8555', 10);
      const onvifFixture = new OnvifProtocolTestFixture({ port: demoOnvifPort });
      const activePort = await onvifFixture.start();
      logger.log(` Demo ONVIF Device Service: http://127.0.0.1:${activePort}/onvif/device_service`);
    } catch (err: any) {
      logger.warn(` Demo ONVIF Device Service could not be started: ${err?.message || err}`);
    }
  }

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
