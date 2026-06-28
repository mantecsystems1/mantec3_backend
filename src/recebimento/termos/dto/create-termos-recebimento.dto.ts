import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTermosRecebimentoDto {
  @IsMongoId()
  recebimentoEquipamentoId: string;

  @IsString()
  @IsNotEmpty()
  texto: string;

  @IsOptional()
  @IsBoolean()
  assinado?: boolean;

  @IsOptional()
  @IsString()
  metodoAssinatura?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataAssinatura?: Date;
}
