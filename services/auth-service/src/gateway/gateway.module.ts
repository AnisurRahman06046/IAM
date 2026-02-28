import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GatewayService } from './gateway.service';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
