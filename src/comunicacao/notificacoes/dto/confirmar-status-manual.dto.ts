import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConfirmarStatusManualNotificacaoDto {
  @IsIn(['enviada', 'lida', 'falha'])
  status!: 'enviada' | 'lida' | 'falha';

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MinLength(5)
  @MaxLength(500)
  observacao!: string;
}
