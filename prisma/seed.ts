import { SupabaseService } from '../src/supabase/supabase.service';

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Definí ADMIN_EMAIL y ADMIN_PASSWORD en el .env para crear el admin inicial');
    process.exit(1);
  }
  const supabase = new SupabaseService();
  try {
    const user = await supabase.createAdminUser(email, password);
    console.log(`Administrador de RRHH creado: ${user.email} (${user.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('422')) {
      console.log(`El usuario ${email} ya existe; nada que hacer.`);
      return;
    }
    throw error;
  }
}

void seed();
