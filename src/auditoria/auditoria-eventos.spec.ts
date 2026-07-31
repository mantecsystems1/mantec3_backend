import { Types } from 'mongoose';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS, montarLogEventoNegocio, toObjectId } from './auditoria-eventos';

describe('auditoria eventos', () => {
  it('converte string em ObjectId', () => {
    const id = new Types.ObjectId().toString();

    expect(toObjectId(id)).toBeInstanceOf(Types.ObjectId);
    expect(toObjectId(id).toString()).toBe(id);
  });

  it('mantem ObjectId recebido', () => {
    const id = new Types.ObjectId();

    expect(toObjectId(id)).toBe(id);
  });

  it('monta log de evento de negocio padronizado', () => {
    const empresaId = new Types.ObjectId().toString();
    const usuarioId = new Types.ObjectId().toString();
    const entidadeId = new Types.ObjectId().toString();

    const log = montarLogEventoNegocio({
      empresaId,
      usuarioId,
      entidadeId,
      tipoEvento: AUDITORIA_EVENTOS.ORCAMENTO_APROVADO,
      entidade: AUDITORIA_ENTIDADES.ORCAMENTO,
      dados: {
        statusAnterior: 'enviado',
        statusAtual: 'aprovado',
      },
    });

    expect(log.empresaId.toString()).toBe(empresaId);
    expect(log.usuarioId.toString()).toBe(usuarioId);
    expect(log.entidadeId.toString()).toBe(entidadeId);
    expect(log.tipoEvento).toBe(AUDITORIA_EVENTOS.ORCAMENTO_APROVADO);
    expect(log.entidade).toBe(AUDITORIA_ENTIDADES.ORCAMENTO);
    expect(log.dados).toEqual({
      statusAnterior: 'enviado',
      statusAtual: 'aprovado',
    });
  });
});
