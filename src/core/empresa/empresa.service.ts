import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Empresa, EmpresaDocument } from './schemas/empresa.schema';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';
import { createHash } from 'crypto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { isPlatformAdmin, tenantFilter } from '../../common/security/tenant-access';
import { normalizarPerfil, PERFIS_SISTEMA } from '../../permissoes/matriz-permissoes';
import { UpdatePixEmpresaDto } from './dto/update-pix-empresa.dto';
import { normalizarPixEmpresa } from './pix-empresa';

@Injectable()
export class EmpresaService {
  constructor(
    @InjectModel(Empresa.name)
    private empresaModel: Model<EmpresaDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  create(data: CreateEmpresaDto) {
    this.assertPixEndpoint(data);
    return this.empresaModel.create(data);
  }

  findAll(empresaId?: string) {
    return this.empresaModel.find(empresaId ? { _id: empresaId } : {});
  }

  findOne(id: string) {
    return this.empresaModel.findById(id).exec();
  }

  update(id: string, data: UpdateEmpresaDto) {
    this.assertPixEndpoint(data);
    return this.empresaModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async updatePix(id: string, dto: UpdatePixEmpresaDto, user: CurrentUserPayload) {
    tenantFilter(user);
    const platformAdmin = isPlatformAdmin(user);
    if (!platformAdmin && (normalizarPerfil(user.perfil ?? '') !== PERFIS_SISTEMA.ADMIN_EMPRESA || id !== user.empresaId)) {
      throw new ForbiddenException('Somente o administrador pode configurar o Pix da própria empresa.');
    }
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Empresa inválida.');
    const actorId = user.id || user._id || user.sub;
    if (!actorId) throw new ForbiddenException('Usuário responsável não informado.');
    const pix = normalizarPixEmpresa(dto);
    return this.empresaModel.db.transaction(async () => {
      const empresa = await this.empresaModel.findByIdAndUpdate(
        id,
        { $set: { pix: { ...pix, atualizadoEm: new Date(), atualizadoPor: actorId } } },
        { returnDocument: 'after', runValidators: true },
      ).exec();
      if (!empresa) throw new NotFoundException('Empresa não encontrada.');
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: empresa._id as Types.ObjectId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.EMPRESA_PIX_ATUALIZADO,
        entidade: AUDITORIA_ENTIDADES.EMPRESA,
        entidadeId: empresa._id as Types.ObjectId,
        dados: {
          habilitado: pix.habilitado,
          ...(pix.habilitado ? {
            tipoChave: pix.tipoChave,
            nomeBeneficiario: pix.nomeBeneficiario,
            cidadeBeneficiario: pix.cidadeBeneficiario,
            chaveHashSha256: createHash('sha256').update(pix.chave).digest('hex'),
          } : {}),
        },
      });
      return empresa;
    });
  }

  private assertPixEndpoint(data: object) {
    if (Object.keys(data).some((key) => key === 'pix' || key.startsWith('pix.') || key.startsWith('$'))) {
      throw new BadRequestException('Use a configuração de Pix da empresa para alterar o beneficiário.');
    }
  }

  async remove(id: string, actorId?: string) {
    const empresa = await this.empresaModel.findByIdAndUpdate(id, { ativa: false }, { new: true }).exec();

    if (empresa && actorId) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: empresa._id as Types.ObjectId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.EMPRESA_DESATIVADA,
        entidade: AUDITORIA_ENTIDADES.EMPRESA,
        entidadeId: empresa._id as Types.ObjectId,
        dados: {
          nomeFantasia: empresa.nomeFantasia,
          cnpj: empresa.cnpj,
          ativa: false,
        },
      });
    }

    return empresa;
  }
}
