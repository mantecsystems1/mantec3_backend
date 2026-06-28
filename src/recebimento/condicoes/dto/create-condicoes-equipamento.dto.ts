import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCondicoesEquipamentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  categoria: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsString()
  @IsNotEmpty()
  severidade: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
