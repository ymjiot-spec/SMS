import { describe, it, expect } from 'vitest';
import { parseVariables, renderTemplate, validateVariableFormat } from '../template.js';

describe('parseVariables', () => {
  it('extracts single variable', () => {
    expect(parseVariables('Hello {{customer_name}}')).toEqual(['customer_name']);
  });

  it('extracts multiple variables', () => {
    const result = parseVariables('{{customer_name}} - ticket {{ticket_id}}');
    expect(result).toEqual(['customer_name', 'ticket_id']);
  });

  it('returns empty array for no variables', () => {
    expect(parseVariables('Hello world')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseVariables('')).toEqual([]);
  });

  it('extracts duplicate variables', () => {
    const result = parseVariables('{{name}} and {{name}}');
    expect(result).toEqual(['name', 'name']);
  });
});

describe('renderTemplate', () => {
  it('replaces all provided variables', () => {
    const result = renderTemplate('Hello {{customer_name}}', {
      customer_name: 'Tanaka',
    });
    expect(result.rendered).toBe('Hello Tanaka');
    expect(result.unresolvedVars).toEqual([]);
  });

  it('leaves unresolved variables as-is', () => {
    const result = renderTemplate('Hello {{customer_name}}, ticket {{ticket_id}}', {
      customer_name: 'Tanaka',
    });
    expect(result.rendered).toBe('Hello Tanaka, ticket {{ticket_id}}');
    expect(result.unresolvedVars).toEqual(['ticket_id']);
  });

  it('treats empty string values as unresolved', () => {
    const result = renderTemplate('Hello {{customer_name}}', {
      customer_name: '',
    });
    expect(result.rendered).toBe('Hello {{customer_name}}');
    expect(result.unresolvedVars).toEqual(['customer_name']);
  });

  it('returns original text when no variables present', () => {
    const result = renderTemplate('Hello world', {});
    expect(result.rendered).toBe('Hello world');
    expect(result.unresolvedVars).toEqual([]);
  });

  it('handles empty body', () => {
    const result = renderTemplate('', { customer_name: 'Tanaka' });
    expect(result.rendered).toBe('');
    expect(result.unresolvedVars).toEqual([]);
  });
});

describe('validateVariableFormat', () => {
  it('accepts valid variable patterns', () => {
    const result = validateVariableFormat('Hello {{customer_name}} {{ticket_id}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts text with no variables', () => {
    const result = validateVariableFormat('Hello world');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty braces {{}}', () => {
    const result = validateVariableFormat('Hello {{}}');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('rejects spaces inside braces {{ }}', () => {
    const result = validateVariableFormat('Hello {{ name }}');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('rejects special characters inside braces', () => {
    const result = validateVariableFormat('Hello {{name!}}');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('reports multiple invalid patterns', () => {
    const result = validateVariableFormat('{{}} and {{ }}');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('accepts valid and rejects invalid in same body', () => {
    const result = validateVariableFormat('{{customer_name}} and {{}}');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
