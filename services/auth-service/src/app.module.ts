import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { KeycloakModule } from './keycloak/keycloak.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { PlatformModule } from './platform/platform.module';
import { GatewayModule } from './gateway/gateway.module';
import { ProductsModule } from './products/products.module';
import { JwtMiddleware } from './common/middleware/jwt.middleware';
import { RolesGuard } from './common/guards/roles.guard';
import { ClientRolesGuard } from './common/guards/client-roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    DatabaseModule,
    RedisModule,
    KeycloakModule,
    AuditModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    PlatformModule,
    GatewayModule,
    ProductsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ClientRolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(JwtMiddleware).forRoutes('*');
  }
}
