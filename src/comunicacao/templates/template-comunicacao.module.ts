import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplateComunicacaoController } from './template-comunicacao.controller';
import { TemplateComunicacaoService } from './template-comunicacao.service';
import { TemplateComunicacao, TemplateComunicacaoSchema } from './template-comunicacao.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TemplateComunicacao.name, schema: TemplateComunicacaoSchema }]),
  ],
  controllers: [TemplateComunicacaoController],
  providers: [TemplateComunicacaoService],
  exports: [TemplateComunicacaoService],
})
export class TemplateComunicacaoModule {}
