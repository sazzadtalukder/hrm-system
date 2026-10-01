import { ValidationError } from '../../common/errors/ApplicationError.js';
import { MONEY_PATTERN } from './payrollConstants.js';

export function toMinorUnits(value) {
  const text = String(value);
  if (!MONEY_PATTERN.test(text)) throw new ValidationError('A monetary value is invalid.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function fromMinorUnits(value) {
  if (value < 0n) throw new ValidationError('A monetary value cannot be negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
