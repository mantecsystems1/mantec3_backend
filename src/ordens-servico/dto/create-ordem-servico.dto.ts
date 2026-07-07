// dto/create-ordem-servico.dto.ts
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

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

  // Aceitar string ISO 8601 e deixar o Mongoose converter para Date ao salvar
  @IsDateString()
  dataEntrada!: string;

  @IsOptional()
  @IsDateString()
  dataConclusao?: string;
}