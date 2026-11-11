import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { requestLoggingMiddleware } from '../common/observability/request-logging';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://mantec.portalmantec.com.br',
  'https://frontmantec2.portalmantec.com.br',
];

export function isProduction(config: ConfigService) {
  return config.get<string>('NODE_ENV') === 'production';
}

export function getRequiredSecret(config: ConfigService, keys: string[], devFallback: string) {
  for (const key of keys) {
    const value = config.get<string>(key)?.trim();
    if (value) {
      return value;
    }
  }

  if (isProduction(config)) {
    throw new Error(`Segredo obrigatorio ausente: ${keys.join(' ou ')}`);
  }

  return devFallback;
}

export function validateSecurityConfig(config: ConfigService) {
  if (!config.get<string>('MONGO_URI')?.trim()) {
    throw new Error('Variavel obrigatoria ausente: MONGO_URI');
  }

  if (isProduction(config)) {
    getRequiredSecret(config, ['AUTH_TOKEN_SECRET', 'JWT_SECRET'], '');
    getRequiredSecret(config, ['PORTAL_CLIENTE_SECRET'], '');

    if (!config.get<string>('CORS_ALLOWED_ORIGINS')?.trim()) {
      throw new Error('Em producao, configure CORS_ALLOWED_ORIGINS com os dominios permitidos.');
    }
  }
}

export function getCorsOrigins(config: ConfigService) {
  const configured = config.get<string>('CORS_ALLOWED_ORIGINS')?.trim();
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return DEFAULT_DEV_ORIGINS;
}

export function configureSecurityHeaders(app: INestApplication) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  });
}

export function configureRequestId(app: INestApplication, config?: ConfigService) {
  // Logs de requisição em JSON ligados por padrão; REQUEST_LOGS=false desliga (ex.: testes).
  const enabled = config?.get<string>('REQUEST_LOGS') !== 'false';
  app.use(requestLoggingMiddleware({ enabled }));
}

export function configureTrustProxy(app: INestApplication, config: ConfigService) {
  const trustProxy = config.get<string>('TRUST_PROXY')?.trim();
  if (!trustProxy) {
    return;
  }

  const expressApp = app.getHttpAdapter().getInstance() as { set?: (key: string, value: string | boolean | number) => void };
  if (!expressApp.set) {
    return;
  }

  if (trustProxy === 'true') {
    expressApp.set('trust proxy', true);
    return;
  }

  if (/^\d+$/.test(trustProxy)) {
    expressApp.set('trust proxy', Number(trustProxy));
    return;
  }

  expressApp.set('trust proxy', trustProxy);
}

export function isSwaggerEnabled(config: ConfigService) {
  if (isProduction(config)) {
    return config.get<string>('SWAGGER_ENABLED') === 'true';
  }

  return config.get<string>('SWAGGER_ENABLED') !== 'false';
}
