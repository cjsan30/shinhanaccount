import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCAL_STORAGE_KEYS } from './storageKeys';

const sourceRoot = join(__dirname, '..');
const keyLiteral = /['"`](shinhanhae-[a-z0-9-]+-v\d+)['"`]/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('local storage keys', () => {
  it('gives every key a distinct string', () => {
    const keys = Object.values(LOCAL_STORAGE_KEYS).map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every key string in the registry only', () => {
    const outside = sourceFiles(sourceRoot)
      .filter((path) => !path.endsWith(join('domain', 'storageKeys.ts')))
      .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(keyLiteral)].map((match) => `${relative(sourceRoot, path)}: ${match[1]}`));
    expect(outside).toEqual([]);
  });
});
