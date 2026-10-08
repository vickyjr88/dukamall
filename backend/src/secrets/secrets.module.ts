import { Global, Module } from '@nestjs/common';
import { SecretsMigrationService } from './secrets-migration.service';

@Global()
@Module({ providers: [SecretsMigrationService], exports: [SecretsMigrationService] })
export class SecretsModule {}
