import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmpresaService } from './empresa.service';
import { EmpresaController } from './empresa.controller';
import { UpdatePixEmpresaDto } from './dto/update-pix-empresa.dto';
import { getPixEmpresaPublico, normalizarPixEmpresa } from './pix-empresa';

const pix: UpdatePixEmpresaDto = { habilitado: true, tipoChave: 'email', chave: ' Receber@Example.invalid ', nomeBeneficiario: ' Empresa QA ', cidadeBeneficiario: ' São Paulo ' };
const actor = { id: '507f1f77bcf86cd799439011', _id: '507f1f77bcf86cd799439011', sub: '507f1f77bcf86cd799439011', empresaId: '507f1f77bcf86cd799439012', nome: 'QA', email: 'qa@example.invalid', perfil: 'admin_empresa' };

describe('Pix da empresa: validação e autorização', () => {
  it('normaliza apenas configuração explícita e não cria Pix para cadastro antigo', () => {
    expect(normalizarPixEmpresa(pix)).toEqual({ ...pix, chave: 'receber@example.invalid', nomeBeneficiario: 'Empresa QA', cidadeBeneficiario: 'São Paulo' });
    expect(getPixEmpresaPublico(undefined)).toBeNull();
    expect(getPixEmpresaPublico({ habilitado: false, chave: 'oculta' })).toBeNull();
    expect(getPixEmpresaPublico({ habilitado: true, tipoChave: 'email', chave: 'a@example.invalid' })).toBeNull();
  });
  it.each([
    ['cpf', '529.982.247-25', '52998224725'], ['cnpj', '11.222.333/0001-81', '11222333000181'],
    ['telefone', '+5511999999999', '+5511999999999'], ['aleatoria', '123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174000'],
  ] as const)('valida e normaliza %s', (tipoChave, chave, esperado) => {
    expect(normalizarPixEmpresa({ ...pix, tipoChave, chave })).toMatchObject({ chave: esperado });
  });
  it.each([
    { tipoChave: 'email', chave: 'javascript:alert(1)' }, { tipoChave: 'telefone', chave: '(11) 99999-9999' },
    { tipoChave: 'cpf', chave: '11111111111' }, { tipoChave: 'cnpj', chave: '52998224725' },
    { tipoChave: 'aleatoria', chave: 'https://example.invalid/qr.png' }, { nomeBeneficiario: ' ' }, { cidadeBeneficiario: '' },
  ])('rejeita chave/beneficiário inválido: %j', (patch) => {
    expect(() => normalizarPixEmpresa({ ...pix, ...patch } as UpdatePixEmpresaDto)).toThrow();
  });
  it('DTO rejeita booleano em string, tipo desconhecido e campos de QR não aceitos', async () => {
    for (const input of [{ habilitado: 'true' }, { ...pix, tipoChave: 'qr' }, { ...pix, qrCodeUrl: 'https://example.invalid' }]) {
      expect(await validate(plainToInstance(UpdatePixEmpresaDto, input), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    }
  });
  it('rejeita gerente, usuário sem empresa e tentativa cruzada antes de gravar', async () => {
    const update = jest.fn(); const service = new EmpresaService({ findByIdAndUpdate: update } as never, {} as never);
    await expect(service.updatePix(actor.empresaId, pix, { ...actor, perfil: 'gerente' })).rejects.toThrow('administrador');
    await expect(service.updatePix('507f1f77bcf86cd799439099', pix, actor)).rejects.toThrow('própria empresa');
    await expect(service.updatePix(actor.empresaId, pix, { ...actor, empresaId: '' })).rejects.toThrow('Empresa');
    expect(update).not.toHaveBeenCalled();
  });
  it('rota minha usa empresa da sessão; rota com id exige plataforma', () => {
    const updatePix = jest.fn(); const controller = new EmpresaController({ updatePix } as never);
    controller.updatePixMinha(pix, actor); expect(updatePix).toHaveBeenCalledWith(actor.empresaId, pix, actor);
    expect(() => controller.updatePix('outra', pix, actor)).toThrow('plataforma');
  });
  it('não permite alterar beneficiário pelo update genérico sem auditoria específica', () => {
    const update = jest.fn(); const service = new EmpresaService({ findByIdAndUpdate: update } as never, {} as never);
    expect(() => service.update(actor.empresaId, { pix } as never)).toThrow('configuração de Pix');
    expect(() => service.update(actor.empresaId, { 'pix.chave': 'outra' } as never)).toThrow('configuração de Pix');
    expect(update).not.toHaveBeenCalled();
  });
});
