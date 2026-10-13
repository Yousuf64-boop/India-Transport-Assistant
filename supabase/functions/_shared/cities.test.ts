import { describe, expect, it } from 'vitest';
import { parseCity, withCity } from './cities.ts';

describe('cities', () => {
  it('falls back to the default city for unknown input', () => {
    expect(parseCity('Atlantis')).toBe('Kolkata');
    expect(parseCity(undefined)).toBe('Kolkata');
    expect(parseCity('Mumbai')).toBe('Mumbai');
  });

  it('appends the city only when it is not already named', () => {
    expect(withCity('Howrah', 'Kolkata')).toBe('Howrah, Kolkata');
    expect(withCity('Howrah Kolkata', 'Kolkata')).toBe('Howrah Kolkata');
    expect(withCity('Cyber Hub', 'Delhi NCR')).toBe('Cyber Hub, Delhi NCR');
    expect(withCity('Anywhere', 'Other')).toBe('Anywhere');
  });
});
