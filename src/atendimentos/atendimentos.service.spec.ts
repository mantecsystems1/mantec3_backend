import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { AtendimentosService } from './atendimentos.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('AtendimentosService — controle anterior às consultas', () => {
  const model = jest.fn();
  const service = new AtendimentosService({ model } as unknown as Connection);
  const id = String(new Types.ObjectId());
  const actor = (perfil = 'tecnico', empresaId = String(new Types.ObjectId())) => ({ perfil, empresaId } as CurrentUserPayload);
  beforeEach(() => model.mockReset());

  it('não consulta sem sessão ou empresa', async () => {
    await expect(service.ficha(id)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.ficha(id, actor('tecnico', ''))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(model).not.toHaveBeenCalled();
  });
  it('não consulta identificadores inválidos', async () => {
    await expect(service.ficha('invalido', actor())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.ficha(id, actor('tecnico', 'invalida'))).rejects.toBeInstanceOf(BadRequestException);
    expect(model).not.toHaveBeenCalled();
  });
  it('não consulta para perfil sem o evento de recebimento', async () => {
    await expect(service.ficha(id, actor('financeiro'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(model).not.toHaveBeenCalled();
  });
});
