import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureSwagger } from '../src/main';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = configureSwagger(app);
  const outDir = join(__dirname, '..', 'openapi');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'openapi.json'), JSON.stringify(document, null, 2));
  await app.close();
}

void exportOpenApi();
