import { describe, expect, it } from 'vitest';
import { createFormatters } from './intl';

describe('createFormatters', () => {
  const moment = new Date('2026-10-22T14:07:00Z');

  it('writes a date with a time in one format for every screen', () => {
    expect(createFormatters('en', 'UTC').formatDateTime(moment)).toBe('Oct 22, 2026, 2:07 PM');
    expect(createFormatters('pt-BR', 'UTC').formatDateTime(moment)).toBe(
      '22 de out. de 2026, 14:07',
    );
  });

  it('applies the time zone', () => {
    expect(createFormatters('en', 'America/Sao_Paulo').formatDateTime(moment)).toBe(
      'Oct 22, 2026, 11:07 AM',
    );
  });
});
