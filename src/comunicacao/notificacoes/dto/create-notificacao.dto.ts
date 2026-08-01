import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class CreateNotificacaoDto {
  @IsNotEmpty()
  empresaId: Types.ObjectId;

  @IsOptional()
  clienteId?: Types.ObjectId | string;

  @IsNotEmpty()
  @IsString()
  tipo: string;

  @IsNotEmpty()
  @IsString()
  destino: string;

  @IsNotEmpty()
  @IsString()
  mensagem: string;

  @IsNotEmpty()
  @IsString()
  status: string;
}
