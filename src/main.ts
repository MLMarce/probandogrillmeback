import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

export function configureSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('RRHH API')
    .setDescription('API del sistema de gestión de empleados RRHH')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  return document;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  configureSwagger(app);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
