import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  configureRequestId,
  configureSecurityHeaders,
  configureTrustProxy,
  getCorsOrigins,
  isSwaggerEnabled,
  validateSecurityConfig,
} from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  validateSecurityConfig(configService);
  configureTrustProxy(app, configService);
  configureRequestId(app, configService);
  configureSecurityHeaders(app);

  const allowedOrigins = getCorsOrigins(configService);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origem nao permitida pelo CORS.'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-Id',
    ],
    exposedHeaders: ['Authorization', 'X-Request-Id'],
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: configService.get<string>('VALIDATION_FORBID_NON_WHITELISTED') === 'true',
    }),
  );

  if (isSwaggerEnabled(configService)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mantec3 API')
      .setDescription('API para o sistema Mantec3')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`API rodando na porta ${port}`);
}

bootstrap();
