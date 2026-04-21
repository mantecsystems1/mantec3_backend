import { IsNotEmpty, IsString, IsObject } from 'class-validator';
import { Types } from 'mongoose';


export class CreateLogEventoDto {
  @IsNotEmpty()
  empresaId: Types.ObjectId;

  @IsNotEmpty()
  usuarioId: Types.ObjectId;

  @IsNotEmpty()
  @IsString()
  tipoEvento: string;

  @IsNotEmpty()
  @IsString()
  entidade: string;

  @IsNotEmpty()
  entidadeId: Types.ObjectId;

  @IsObject()
  dados?: any;
}