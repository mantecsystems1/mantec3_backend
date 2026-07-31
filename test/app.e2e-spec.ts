import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { FirebaseAuthGuard } from '../src/auth/firebase/firebase.guard';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: (context) => {
          const requestContext = context.switchToHttp().getRequest();
          requestContext.user = {
            uid: 'user-e2e',
            email: 'usuario.e2e@mantec.local',
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/secure (GET)', () => {
    return request(app.getHttpServer())
      .get('/secure')
      .expect(200)
      .expect({
        uid: 'user-e2e',
        email: 'usuario.e2e@mantec.local',
      });
  });
});
