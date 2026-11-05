import { Module } from '@nestjs/common';
import { PortalSectionsController } from './portal-sections.controller';
import { PortalSectionsService } from './portal-sections.service';

@Module({ controllers: [PortalSectionsController], providers: [PortalSectionsService] })
export class PortalSectionsModule {}
