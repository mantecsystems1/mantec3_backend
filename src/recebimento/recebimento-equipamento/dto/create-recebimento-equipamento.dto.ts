import { Type } from 'class-transformer';
import { IsDate, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CATEGORIAS_EQUIPAMENTO } from '../../../common/equipamento-categorias';

export class CreateRecebimentoEquipamentoDto {
  @IsMongoId()
  empresaId: string;

  @IsMongoId()
  clienteId: string;

  @IsString()
  @IsNotEmpty()
  tipoEquipamento: string;

  @IsOptional()
  @IsIn(CATEGORIAS_EQUIPAMENTO)
  categoriaEquipamento?: string;

  @IsString()
  @IsNotEmpty()
  marca: string;

  @IsString()
  @IsNotEmpty()
  modelo: string;

  @IsOptional()
  @IsString()
  imeiOuSerial?: string;

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
