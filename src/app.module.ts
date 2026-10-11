import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [PrismaModule, AuditModule, SupabaseModule, HealthModule, AuthModule],
})
export class AppModule {}
