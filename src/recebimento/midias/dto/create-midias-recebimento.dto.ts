import { IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateMidiasRecebimentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsUrl({ require_protocol: true })
  urlArquivo: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
