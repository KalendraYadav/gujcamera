import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { CamerasModule } from './modules/cameras/cameras.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    HealthModule,
    CamerasModule,
  ],
  providers: [
    // Global JWT authentication guard (respects @Public() decorator)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global server-side RBAC guard (respects @Roles() decorator)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global standardized error envelope filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global structured logging interceptor with request IDs
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
