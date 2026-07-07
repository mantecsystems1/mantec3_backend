// dto/create-itens-utilizados-os.dto.ts
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateItensUtilizadosOSDto {
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