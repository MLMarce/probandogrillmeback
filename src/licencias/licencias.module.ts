import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { LicenciasController } from './licencias.controller';
import { LicenciasService } from './licencias.service';

@Module({
  imports: [SupabaseModule],
  controllers: [LicenciasController],
  providers: [LicenciasService],
})
export class LicenciasModule {}
