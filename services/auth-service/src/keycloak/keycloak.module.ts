import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { KeycloakAdminService } from './keycloak-admin.service';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('keycloak.baseUrl'),
        timeout: 10000,
      }),
    }),
  ],
  providers: [KeycloakAdminService],
  exports: [KeycloakAdminService],
})
export class KeycloakModule {}
