import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingGuard } from './billing.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, { provide: APP_GUARD, useClass: BillingGuard }],
})
export class BillingModule {}
