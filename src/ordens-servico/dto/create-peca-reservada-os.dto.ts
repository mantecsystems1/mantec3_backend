import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreatePecaReservadaOSDto {
  @IsString()
  @IsNotEmpty()
  ordemServicoId!: string;

  @IsString()
  @IsNotEmpty()
  produtoId!: string;

  @IsNumber()
  @IsNotEmpty()
  quantidade!: number;
}
