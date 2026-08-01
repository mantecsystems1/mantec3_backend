import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService', () => {
  it('consulta timeline por entidade ordenada por data decrescente', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ exec });
    const populate = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ populate });

    const service = new AuditoriaService({ find } as never);
    const entidadeId = new Types.ObjectId().toString();

    await service.findByEntidade('orcamento', entidadeId);

    expect(find).toHaveBeenCalledWith({
      entidade: 'orcamento',
      entidadeId: new Types.ObjectId(entidadeId),
    });
    expect(populate).toHaveBeenCalledWith('usuarioId', 'nome email perfil');
    expect(sort).toHaveBeenCalledWith({ data: -1 });
    expect(exec).toHaveBeenCalled();
  });

  it('filtra logs pela empresa autenticada', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ exec });

    const service = new AuditoriaService({ find } as never);
    const empresaId = new Types.ObjectId().toString();

    await service.findAll(empresaId);

    expect(find).toHaveBeenCalledWith({ empresaId });
  });

  it('filtra timeline por entidade e empresa autenticada', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ exec });
    const populate = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ populate });

    const service = new AuditoriaService({ find } as never);
    const empresaId = new Types.ObjectId().toString();
    const entidadeId = new Types.ObjectId().toString();

    await service.findByEntidade('pagamento', entidadeId, empresaId);

    expect(find).toHaveBeenCalledWith({
      entidade: 'pagamento',
      entidadeId: new Types.ObjectId(entidadeId),
      empresaId,
    });
  });

  it('bloqueia criacao direta de log para outra empresa', async () => {
    const service = new AuditoriaService({} as never);

    await expect(service.create({
      empresaId: new Types.ObjectId(),
      usuarioId: new Types.ObjectId(),
      tipoEvento: 'PAGAMENTO_REGISTRADO',
      entidade: 'pagamento',
      entidadeId: new Types.ObjectId(),
    }, new Types.ObjectId().toString())).rejects.toThrow(BadRequestException);
  });
});
