import { Global, Module } from '@nestjs/common';
import { TrialService } from './trial.service';
import { EmailModule } from '../email/email.module';

@Global()
@Module({ imports: [EmailModule], providers: [TrialService], exports: [TrialService] })
export class TrialModule {}
