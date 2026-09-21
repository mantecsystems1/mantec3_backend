import { registerDecorator, ValidationOptions } from 'class-validator';

export function isValidCpfCnpj(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[\d.\-/\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
  const calculate = (base: string, weights: number[]) => {
    const rest = [...base].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11;
    return rest < 2 ? '0' : String(11 - rest);
  };
  const base = digits.slice(0, -2);
  const weights = digits.length === 11 ? [10,9,8,7,6,5,4,3,2] : [5,4,3,2,9,8,7,6,5,4,3,2];
  const first = calculate(base, weights);
  const second = calculate(base + first, [digits.length === 11 ? 11 : 6, ...weights]);
  return digits === base + first + second;
}

export function IsCpfCnpj(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => registerDecorator({
    name: 'isCpfCnpj', target: target.constructor, propertyName: String(propertyKey),
    options: { message: 'CPF ou CNPJ invalido.', ...options },
    validator: { validate: isValidCpfCnpj },
  });
}
