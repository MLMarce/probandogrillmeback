import { Module } from '@nestjs/common';
import { EmpleadosModule } from '../empleados/empleados.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';

@Module({
  imports: [SupabaseModule, EmpleadosModule],
  controllers: [ImportacionController],
  providers: [ImportacionService],
})
export class ImportacionModule {}
