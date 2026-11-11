import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  NotFoundException,
  Post,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongooseExceptionFilter } from '../src/common/filters/mongoose-exception.filter';

class CriarDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}

@Controller('contrato-erro')
class ContratoErroController {
  @Post('validacao')
  validacao(@Body() dto: CriarDto) {
    return dto;
  }

  @Get('401')
  naoAutenticado() {
    throw new UnauthorizedException('Token nao informado.');
  }

  @Get('403')
  semPermissao() {
    throw new ForbiddenException('Seu perfil nao possui permissao para executar esta acao.');
  }

  @Get('404')
  naoEncontrado() {
    throw new NotFoundException('Registro nao encontrado.');
  }

  @Get('409')
  conflito() {
    throw new ConflictException('Cadastro ja existe.');
  }

  @Get('cast')
  cast() {
    throw Object.assign(new Error('Cast to ObjectId failed for value "abc"'), { name: 'CastError', kind: 'ObjectId' });
  }

  @Get('500')
  inesperado() {
    throw new Error('detalhe interno sensivel');
  }
}

describe('Contrato de erro HTTP (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [ContratoErroController],
      providers: [{ provide: APP_FILTER, useClass: MongooseExceptionFilter }],
    }).compile();

    app = moduleFixture.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectJson = (res: request.Response, status: number) => {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.statusCode).toBe(status);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\bat \w|<html|<pre>/i);
  };

  it('400 de validacao traz as mensagens dos campos', async () => {
    const res = await request(app.getHttpServer()).post('/contrato-erro/validacao').send({});
    expectJson(res, 400);
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.message.join(' ')).toContain('nome');
  });

  it.each([
    ['401', 401, 'Token nao informado.'],
    ['403', 403, 'Seu perfil nao possui permissao para executar esta acao.'],
    ['404', 404, 'Registro nao encontrado.'],
    ['409', 409, 'Cadastro ja existe.'],
    ['cast', 400, 'Identificador invalido.'],
  ])('%s responde JSON com a mensagem de negocio', async (rota, status, mensagem) => {
    const res = await request(app.getHttpServer()).get(`/contrato-erro/${rota}`);
    expectJson(res, status);
    expect(res.body.message).toBe(mensagem);
  });

  it('500 responde JSON generico sem detalhes internos', async () => {
    const res = await request(app.getHttpServer()).get('/contrato-erro/500');
    expectJson(res, 500);
    expect(JSON.stringify(res.body)).not.toContain('sensivel');
  });
});
