import { Types } from 'mongoose';
import { CreateLogEventoDto } from './dto/create-log-evento.dto';

export const AUDITORIA_EVENTOS = {
  RECEBIMENTO_CRIADO: 'RECEBIMENTO_CRIADO',
  TERMO_GERADO: 'TERMO_GERADO',
  CLIENTE_CRIADO: 'CLIENTE_CRIADO',
  CLIENTE_ATUALIZADO: 'CLIENTE_ATUALIZADO',
  CLIENTE_REMOVIDO: 'CLIENTE_REMOVIDO',
  ORCAMENTO_CRIADO: 'ORCAMENTO_CRIADO',
  ORCAMENTO_ENVIADO: 'ORCAMENTO_ENVIADO',
  ORCAMENTO_APROVADO: 'ORCAMENTO_APROVADO',
  ORCAMENTO_REPROVADO: 'ORCAMENTO_REPROVADO',
  ORCAMENTO_CANCELADO: 'ORCAMENTO_CANCELADO',
  OS_CRIADA: 'OS_CRIADA',
  OS_STATUS_ALTERADO: 'OS_STATUS_ALTERADO',
  PECA_RESERVADA: 'PECA_RESERVADA',
  PECA_CONSUMIDA: 'PECA_CONSUMIDA',
  ESTOQUE_AJUSTADO: 'ESTOQUE_AJUSTADO',
  VENDA_GERADA: 'VENDA_GERADA',
  VENDA_ATUALIZADA: 'VENDA_ATUALIZADA',
  VENDA_REMOVIDA: 'VENDA_REMOVIDA',
  PAGAMENTO_REGISTRADO: 'PAGAMENTO_REGISTRADO',
  PAGAMENTO_ATUALIZADO: 'PAGAMENTO_ATUALIZADO',
  PAGAMENTO_REMOVIDO: 'PAGAMENTO_REMOVIDO',
  NOTA_FISCAL_EMITIDA: 'NOTA_FISCAL_EMITIDA',
  GARANTIA_ABERTA: 'GARANTIA_ABERTA',
  GARANTIA_STATUS_ALTERADO: 'GARANTIA_STATUS_ALTERADO',
  GARANTIA_FINALIZADA: 'GARANTIA_FINALIZADA',
} as const;

export type AuditoriaEvento = (typeof AUDITORIA_EVENTOS)[keyof typeof AUDITORIA_EVENTOS];

export const AUDITORIA_ENTIDADES = {
  RECEBIMENTO: 'recebimento',
  TERMO_RECEBIMENTO: 'termo_recebimento',
  CLIENTE: 'cliente',
  ORCAMENTO: 'orcamento',
  ORDEM_SERVICO: 'ordem_servico',
  ESTOQUE: 'estoque',
  VENDA: 'venda',
  PAGAMENTO: 'pagamento',
  NOTA_FISCAL: 'nota_fiscal',
  GARANTIA: 'garantia',
} as const;

export type AuditoriaEntidade = (typeof AUDITORIA_ENTIDADES)[keyof typeof AUDITORIA_ENTIDADES];

export interface EventoNegocioAuditavel {
  empresaId: string | Types.ObjectId;
  usuarioId: string | Types.ObjectId;
  tipoEvento: AuditoriaEvento;
  entidade: AuditoriaEntidade;
  entidadeId: string | Types.ObjectId;
  dados?: Record<string, unknown>;
}

export function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

export function montarLogEventoNegocio(evento: EventoNegocioAuditavel): CreateLogEventoDto {
  return {
    empresaId: toObjectId(evento.empresaId),
    usuarioId: toObjectId(evento.usuarioId),
    tipoEvento: evento.tipoEvento,
    entidade: evento.entidade,
    entidadeId: toObjectId(evento.entidadeId),
    dados: evento.dados ?? {},
  };
}
