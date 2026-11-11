import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: { readyState: 1 },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should report liveness', () => {
      expect(appController.live()).toMatchObject({
        status: 'ok',
      });
    });

    it('should report readiness', () => {
      expect(appController.ready()).toMatchObject({
        status: 'ok',
        database: 'connected',
      });
    });
  });
});
