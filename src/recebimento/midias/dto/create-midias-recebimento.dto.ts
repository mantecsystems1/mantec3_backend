import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMidiasRecebimentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsString()
  @IsNotEmpty()
  urlArquivo: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
