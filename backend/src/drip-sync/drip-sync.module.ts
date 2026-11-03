import { Module } from '@nestjs/common';
import { DripSyncController } from './drip-sync.controller';
import { DripSyncService } from './drip-sync.service';

@Module({
  controllers: [DripSyncController],
  providers: [DripSyncService],
  exports: [DripSyncService],
})
export class DripSyncModule {}
