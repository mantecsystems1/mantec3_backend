import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Usuario, UsuarioDocument } from './schemas/usuario.schema';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { isPlatformAdmin, tenantFilter } from '../common/security/tenant-access';
import { normalizarPerfil, PERFIS_SISTEMA } from '../permissoes/matriz-permissoes';

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = 'scrypt';
const PLATFORM_ROLE = /^\s*(?:admin|administrador)\s*$/i;

@Injectable()
export class UsuariosService {
  constructor(
    @InjectModel(Usuario.name)
    private usuarioModel: Model<UsuarioDocument>,
  ) {}

  async create(createUsuarioDto: CreateUsuarioDto, actor?: CurrentUserPayload) {
    this.validateAssignment(createUsuarioDto, actor);
    const senhaHash = await this.buildSenhaHash(createUsuarioDto);
    const { senha, ...usuarioDto } = createUsuarioDto;
    const createdUsuario = new this.usuarioModel({
      ...usuarioDto,
      email: createUsuarioDto.email.trim().toLowerCase(),
      senhaHash,
    });
    const usuario = await createdUsuario.save();
    const response = usuario.toObject() as ReturnType<typeof usuario.toObject> & {
      senhaHash?: string;
    };
    delete response.senhaHash;
    return response;
  }

  findAll(actor?: CurrentUserPayload) {
    return this.usuarioModel.find(tenantFilter(actor)).populate('empresaId', 'nomeFantasia razaoSocial').exec();
  }

  findTecnicos(empresaId?: string) {
    if (!empresaId) throw new UnauthorizedException('Empresa nao informada.');
    const query: Record<string, unknown> = {
      ativo: true,
      perfil: { $in: ['tecnico', 'tecnico_assistencia'] },
    };

    if (empresaId) {
      query.empresaId = empresaId;
    }

    return this.usuarioModel.find(query).select('nome email perfil empresaId ativo').exec();
  }

  findOne(id: string, actor?: CurrentUserPayload) {
    return this.usuarioModel.findOne({ _id: id, ...tenantFilter(actor) }).populate('empresaId', 'nomeFantasia razaoSocial').exec();
  }

  findForAuthentication(id: string) {
    return this.usuarioModel.findById(id).populate('empresaId').exec();
  }

  findByEmail(email: string) {
    return this.usuarioModel
      .findOne({ email: email.trim().toLowerCase(), ativo: true })
      .select('+senhaHash')
      .populate('empresaId')
      .exec();
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto, actor?: CurrentUserPayload) {
    this.assertSelfAccessSafe(id, updateUsuarioDto, actor);
    this.validateAssignment(updateUsuarioDto, actor);
    const senhaHash =
      updateUsuarioDto.senha || updateUsuarioDto.senhaHash
        ? await this.buildSenhaHash(updateUsuarioDto)
        : undefined;

    const updatePayload = {
      ...updateUsuarioDto,
      ...(updateUsuarioDto.email
        ? { email: updateUsuarioDto.email.trim().toLowerCase() }
        : {}),
      ...(senhaHash ? { senhaHash } : {}),
    };
    delete updatePayload.senha;

    return this.usuarioModel
      .findOneAndUpdate({ _id: id, ...tenantFilter(actor), ...(!isPlatformAdmin(actor) ? { perfil: { $not: PLATFORM_ROLE } } : {}) }, { $set: updatePayload, $inc: { tokenVersion: 1 } }, { new: true, runValidators: true })
      .exec();
  }

  remove(id: string, actor?: CurrentUserPayload) {
    this.assertNotSelf(id, actor, 'Nao e permitido excluir a propria conta.');
    return this.usuarioModel.findOneAndDelete({ _id: id, ...tenantFilter(actor), ...(!isPlatformAdmin(actor) ? { perfil: { $not: PLATFORM_ROLE } } : {}) }).exec();
  }

  private assertSelfAccessSafe(id: string, dto: UpdateUsuarioDto, actor?: CurrentUserPayload) {
    if (dto.ativo === false) {
      this.assertNotSelf(id, actor, 'Nao e permitido bloquear a propria conta.');
    }
  }

  private assertNotSelf(id: string, actor: CurrentUserPayload | undefined, message: string) {
    const actorIds = [actor?.id, actor?._id, actor?.sub].filter(Boolean).map(String);
    if (actorIds.includes(String(id))) {
      throw new ForbiddenException(message);
    }
  }

  private validateAssignment(dto: CreateUsuarioDto | UpdateUsuarioDto, actor?: CurrentUserPayload) {
    tenantFilter(actor);
    if (dto.perfil !== undefined && typeof dto.perfil !== 'string') throw new BadRequestException('Perfil invalido.');
    const perfil = dto.perfil === undefined ? undefined : normalizarPerfil(dto.perfil);
    if (perfil === null) throw new BadRequestException('Perfil invalido.');
    if (!isPlatformAdmin(actor) && (
      (dto.empresaId !== undefined && dto.empresaId !== actor?.empresaId) ||
      perfil === PERFIS_SISTEMA.ADMINISTRADOR
    )) throw new ForbiddenException('Nao e permitido alterar a empresa ou atribuir administrador da plataforma.');
    if (perfil) dto.perfil = perfil;
  }

  async validatePassword(usuario: UsuarioDocument, senha: string) {
    const senhaHash = usuario.senhaHash;

    if (!senhaHash?.startsWith(`${HASH_PREFIX}:`)) {
      return senhaHash === senha;
    }

    const [, salt, storedKey] = senhaHash.split(':');
    const typedKey = (await scrypt(senha, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(storedKey, 'hex');

    return (
      typedKey.length === storedBuffer.length &&
      timingSafeEqual(typedKey, storedBuffer)
    );
  }

  async hashPassword(senha: string) {
    const salt = randomBytes(16).toString('hex');
    const key = (await scrypt(senha, salt, 64)) as Buffer;
    return `${HASH_PREFIX}:${salt}:${key.toString('hex')}`;
  }

  private async buildSenhaHash(dto: CreateUsuarioDto | UpdateUsuarioDto) {
    if (dto.senha) {
      return this.hashPassword(dto.senha);
    }

    if (dto.senhaHash?.startsWith(`${HASH_PREFIX}:`)) {
      return dto.senhaHash;
    }

    if (dto.senhaHash) {
      return this.hashPassword(dto.senhaHash);
    }

    throw new BadRequestException('Senha obrigatoria');
  }
}
