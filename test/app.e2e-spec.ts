import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: getConnectionToken(), useValue: { readyState: 1 } }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health/live (GET)', () => request(app.getHttpServer()).get('/health/live').expect(200).expect((res) => {
    expect(res.body.status).toBe('ok');
  }));

  it('/health/ready (GET)', () => request(app.getHttpServer()).get('/health/ready').expect(200).expect((res) => {
    expect(res.body).toMatchObject({ status: 'ok', database: 'connected' });
  }));

  it('/secure (rota legada do Firebase) não existe mais', () => request(app.getHttpServer()).get('/secure').expect(404));
});
