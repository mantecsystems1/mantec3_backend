import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotaFiscalServicoService } from './nota-fiscal-servico.service';

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const empresaId = new Types.ObjectId().toString();
const vendaId = new Types.ObjectId();

const createService = (status: string, deleted: unknown = { _id: 'nota', vendaId, numero: '10', status }) => {
  const nota = { _id: new Types.ObjectId(), vendaId, numero: '10', status };
  const notaModel = {
    findById: jest.fn().mockReturnValue(exec(nota)),
    findOneAndDelete: jest.fn().mockReturnValue(exec(deleted)),
    findByIdAndUpdate: jest.fn().mockReturnValue(exec({ ...nota, status: 'processando' })),
  };
  const vendaModel = { findOne: jest.fn().mockReturnValue(exec({ _id: vendaId, empresaId })) };
  const auditoria = { registrarEventoNegocio: jest.fn().mockResolvedValue(undefined) };
  const service = new NotaFiscalServicoService(notaModel as never, vendaModel as never, auditoria as never);
  return { service, notaModel, auditoria };
};

describe('NotaFiscalServicoService — proteção de nota emitida', () => {
  it.each(['emitida', ' Emitida '])('recusa excluir nota com status %p e não apaga nada', async (status) => {
    const { service, notaModel, auditoria } = createService(status);

    await expect(service.remove('id', 'ator', empresaId)).rejects.toBeInstanceOf(ConflictException);
    expect(notaModel.findOneAndDelete).not.toHaveBeenCalled();
    expect(auditoria.registrarEventoNegocio).not.toHaveBeenCalled();
  });

  it('exclui nota em processamento com condição atômica e registra auditoria', async () => {
    const { service, notaModel, auditoria } = createService('processando');

    await service.remove('id', 'ator', empresaId);

    expect(notaModel.findOneAndDelete).toHaveBeenCalledWith({ _id: 'id', status: { $not: expect.any(RegExp) } });
    expect(auditoria.registrarEventoNegocio).toHaveBeenCalledTimes(1);
  });

  it('não apaga se a nota virou emitida entre a leitura e a exclusão', async () => {
    const { service, auditoria } = createService('processando', null);

    await expect(service.remove('id', 'ator', empresaId)).rejects.toBeInstanceOf(ConflictException);
    expect(auditoria.registrarEventoNegocio).not.toHaveBeenCalled();
  });

  it('recusa tirar uma nota do status emitida', async () => {
    const { service, notaModel } = createService('emitida');

    await expect(service.update('id', { status: 'processando' }, 'ator', empresaId)).rejects.toBeInstanceOf(ConflictException);
    expect(notaModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('permite atualizar outros dados de nota emitida e promover processando para emitida', async () => {
    const emitida = createService('emitida');
    await emitida.service.update('id', { pdfUrl: 'https://exemplo.invalid/nota.pdf' }, 'ator', empresaId);
    expect(emitida.notaModel.findByIdAndUpdate).toHaveBeenCalled();

    const processando = createService('processando');
    await processando.service.update('id', { status: 'emitida' }, 'ator', empresaId);
    expect(processando.notaModel.findByIdAndUpdate).toHaveBeenCalled();
  });
});
