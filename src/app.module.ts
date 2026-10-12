import { Module } from '@nestjs/common';
import { AreasModule } from './areas/areas.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EmpleadosModule } from './empleados/empleados.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    SupabaseModule,
    HealthModule,
    AuthModule,
    AreasModule,
    EmpleadosModule,
  ],
})
export class AppModule {}
