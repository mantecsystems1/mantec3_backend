// dto/create-ordem-servico.dto.ts
import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
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

  @IsDateString()
  @Transform(({ value }) => new Date(value))
  dataEntrada!: Date;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  dataConclusao?: Date;
}