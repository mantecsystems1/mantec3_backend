import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateComponentesAusentesDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  nomeComponente: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
