import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { TemplateComunicacao, TemplateComunicacaoDocument } from './template-comunicacao.schema';
import { UpsertTemplateComunicacaoDto } from './dto/upsert-template-comunicacao.dto';
import { TEMPLATE_COMUNICACAO_DEFAULTS } from './template-comunicacao.defaults';

@Injectable()
export class TemplateComunicacaoService {
  constructor(
    @InjectModel(TemplateComunicacao.name) private readonly templateModel: Model<TemplateComunicacaoDocument>,
  ) {}

  async findAll(user?: CurrentUserPayload) {
    const empresaId = this.getEmpresaId(user);
    const customTemplates = await this.templateModel.find({ empresaId }).sort({ nome: 1 }).lean().exec();

    return TEMPLATE_COMUNICACAO_DEFAULTS.map((defaultTemplate) => {
      const custom = customTemplates.find((template) => template.chave === defaultTemplate.chave);
      return {
        ...defaultTemplate,
        ...(custom ? JSON.parse(JSON.stringify(custom)) : {}),
        empresaId: String(empresaId),
        customizado: Boolean(custom),
      };
    });
  }

  async findByChave(chave: string, user?: CurrentUserPayload) {
    const templates = await this.findAll(user);
    const template = templates.find((item) => item.chave === chave);
    if (!template) {
      throw new NotFoundException('Template de comunicacao nao encontrado.');
    }
    return template;
  }

  async upsert(dto: UpsertTemplateComunicacaoDto, user?: CurrentUserPayload) {
    const empresaId = this.getEmpresaId(user);
    const defaultTemplate = TEMPLATE_COMUNICACAO_DEFAULTS.find((item) => item.chave === dto.chave);
    if (!defaultTemplate) {
      throw new NotFoundException('Template de comunicacao nao encontrado.');
    }

    const updated = await this.templateModel.findOneAndUpdate(
      { empresaId, chave: dto.chave },
      {
        empresaId,
        chave: dto.chave,
        nome: dto.nome || defaultTemplate.nome,
        assunto: dto.assunto,
        mensagem: dto.mensagem,
        variaveis: dto.variaveis ?? defaultTemplate.variaveis,
        ativo: dto.ativo ?? true,
      },
      { new: true, upsert: true },
    ).lean().exec();

    return updated;
  }

  private getEmpresaId(user?: CurrentUserPayload) {
    if (!user?.empresaId) {
      throw new UnauthorizedException('Usuario sem empresa vinculada.');
    }
    return new Types.ObjectId(user.empresaId);
  }
}
