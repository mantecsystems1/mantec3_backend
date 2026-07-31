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
});
