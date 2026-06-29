import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Usuario, UsuarioDocument } from './schemas/usuario.schema';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = 'scrypt';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectModel(Usuario.name)
    private usuarioModel: Model<UsuarioDocument>,
  ) {}

  async create(createUsuarioDto: CreateUsuarioDto) {
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

  findAll() {
    return this.usuarioModel.find().populate('empresaId', 'nomeFantasia razaoSocial').exec();
  }

  findOne(id: string) {
    return this.usuarioModel.findById(id).populate('empresaId', 'nomeFantasia razaoSocial').exec();
  }

  findByEmail(email: string) {
    return this.usuarioModel
      .findOne({ email: email.trim().toLowerCase(), ativo: true })
      .select('+senhaHash')
      .populate('empresaId')
      .exec();
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto) {
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
      .findByIdAndUpdate(id, updatePayload, { new: true })
      .exec();
  }

  remove(id: string) {
    return this.usuarioModel.findByIdAndDelete(id).exec();
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
