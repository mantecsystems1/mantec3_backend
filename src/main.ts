import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 204,
  });

  // Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Arquivos estáticos
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Mantec3 API')
    .setDescription('API para o sistema Mantec3')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Inicialização
  await app.listen(3000, '0.0.0.0');

  console.log(`🚀 API rodando em http://0.0.0.0:3000`);
}

bootstrap();
/*
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração Swagger
  const config = new DocumentBuilder()
    .setTitle('Mantec3 API')
    .setDescription('API para o sistema Mantec3')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // --- Endpoint para listar todas as rotas ---
  app.getHttpAdapter().getInstance().get('/__rotas', (_, res) => {
    try {
      const server = app.getHttpAdapter().getInstance();
      const rotas: string[] = [];

      if (server._router && server._router.stack) {
        server._router.stack.forEach((r: any) => {
          if (r.route && r.route.path) {
            rotas.push(r.route.path);
          }
        });
      }

      res.json(rotas);
    } catch (err) {
      console.error('Erro ao listar rotas:', err);
      res.status(500).json({ error: 'Erro ao listar rotas' });
    }
  });
  // --------------------------------------------

  await app.listen(3000);
}
bootstrap();*/
