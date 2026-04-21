export class CreateFornecedorDto {
  empresaId: string;
  nome: string;
  cnpj: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  ativo?: boolean;
}
