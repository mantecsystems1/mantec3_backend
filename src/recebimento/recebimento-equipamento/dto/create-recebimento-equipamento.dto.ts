import { Type } from 'class-transformer';
import { IsDate, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRecebimentoEquipamentoDto {
  @IsMongoId()
  empresaId: string;

  @IsMongoId()
  clienteId: string;

  @IsString()
  @IsNotEmpty()
  tipoEquipamento: string;

  @IsString()
  @IsNotEmpty()
  marca: string;

  @IsString()
  @IsNotEmpty()
  modelo: string;

  @IsString()
  @IsNotEmpty()
  imeiOuSerial: string;

  @Type(() => Date)
  @IsDate()
  dataRecebimento: Date;

  @IsMongoId()
  recebidoPor: string;

  @IsOptional()
  @IsString()
  observacoesGerais?: string;

  @IsString()
  @IsNotEmpty()
  status: string;
}
