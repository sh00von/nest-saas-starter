import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** Liveness and readiness probes for load balancers and orchestrators. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
