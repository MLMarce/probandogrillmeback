import { config as loadEnv } from 'dotenv';
import { SupabaseService } from '../src/supabase/supabase.service';

loadEnv({ quiet: true });

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      'Definí ADMIN_EMAIL y ADMIN_PASSWORD en el .env para crear la cuenta inicial de Administrador de RRHH',
    );
    process.exit(1);
  }
  const supabase = new SupabaseService();
  try {
    const user = await supabase.createAccount(email, password);
    console.log(`Cuenta de Administrador de RRHH creada: ${user.email} (${user.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('422')) {
      console.log(`La cuenta ${email} ya existe; nada que hacer.`);
      return;
    }
    throw error;
  }
}

void seed();
