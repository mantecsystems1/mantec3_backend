import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { FirebaseAuthGuard } from './auth/firebase/firebase.guard';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
  });

  describe('secure', () => {
    it('should return authenticated user data', () => {
      const req = { user: { uid: 'user-1', email: 'user@example.com' } };

      expect(appController.secure(req)).toEqual({
        uid: 'user-1',
        email: 'user@example.com',
      });
    });
  });
});
