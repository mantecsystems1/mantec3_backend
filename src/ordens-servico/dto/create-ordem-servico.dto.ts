// dto/create-ordem-servico.dto.ts
import { IsString, IsOptional, IsEnum, IsISO8601, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateOrdemServicoDto {
  @IsString()
  empresaId!: string;

  @IsString()
  clienteId!: string;

  @IsString()
  tecnicoId!: string;

  @IsOptional()
  @IsString()
  orcamentoId?: string;

  @IsString()
  recebimentoEquipamentoId!: string;

  @IsEnum(['aberta', 'em_diagnostico', 'em_execucao', 'concluida', 'cancelada'])
  statusOperacional!: string;

  @IsEnum(['baixa', 'normal', 'alta', 'urgente'])
  prioridade!: string;

  // Mudança principal aqui:
  @IsISO8601({ strict: false })           // Mais flexível que @IsDateString
  @Transform(({ value }) => value ? new Date(value) : value)
  dataEntrada!: Date;

  @IsOptional()
  @IsISO8601({ strict: false })
  @Transform(({ value }) => value ? new Date(value) : undefined)
  dataConclusao?: Date;
}