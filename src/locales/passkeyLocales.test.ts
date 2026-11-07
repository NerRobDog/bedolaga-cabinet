import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import fa from './fa.json';
import ru from './ru.json';
import zh from './zh.json';

/**
 * Паритет passkey-перевода во ВСЕХ четырёх локалях. Общий locales.test.ts сверяет только
 * en и ru, а zh и fa у проекта неполные и падают на ru: для нового раздела так нельзя —
 * человек, открывший кабинет на китайском или персидском, не должен читать про резервные
 * коды по-русски.
 */

type Tree = { [key: string]: Tree | string };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const LOCALES = { ru, en, zh, fa } as unknown as Record<string, Tree>;
const passkey = Object.fromEntries(
  Object.entries(LOCALES).map(([lang, tree]) => [lang, flatten(tree.passkey as Tree, 'passkey')]),
);

const PLACEHOLDER = /\{\{[^}]+\}\}/g;
const placeholders = (value: string) => (value.match(PLACEHOLDER) ?? []).sort().join(',');

describe('passkey: переводы', () => {
  it('в каждой локали есть раздел passkey', () => {
    for (const lang of Object.keys(LOCALES)) {
      expect(passkey[lang].size, lang).toBeGreaterThan(0);
    }
  });

  it.each(['en', 'zh', 'fa'])('набор ключей %s совпадает с ru', (lang) => {
    const ruKeys = [...passkey.ru.keys()].sort();
    expect([...passkey[lang].keys()].sort()).toEqual(ruKeys);
  });

  it.each(['en', 'zh', 'fa'])('плейсхолдеры {{...}} в %s совпадают с ru', (lang) => {
    const mismatches: string[] = [];
    for (const [key, ruValue] of passkey.ru) {
      const value = passkey[lang].get(key) ?? '';
      if (placeholders(value) !== placeholders(ruValue)) mismatches.push(key);
    }
    expect(mismatches).toEqual([]);
  });

  it('ни один перевод не пуст', () => {
    const empty: string[] = [];
    for (const [lang, flat] of Object.entries(passkey)) {
      for (const [key, value] of flat) if (!value.trim()) empty.push(`${lang}:${key}`);
    }
    expect(empty).toEqual([]);
  });
});

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('passkey: ключи из кода', () => {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf-8');
    for (const match of text.matchAll(/['"`](passkey\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)['"`]/g)) {
      used.set(match[1], [...(used.get(match[1]) ?? []), relative(SRC, file)]);
    }
  }

  it('код ссылается на passkey-ключи (проверка не вхолостую)', () => {
    expect(used.size).toBeGreaterThan(0);
  });

  it('каждый ключ из кода есть во всех четырёх локалях', () => {
    const missing: string[] = [];
    for (const [key, files] of used) {
      for (const [lang, flat] of Object.entries(passkey)) {
        if (!flat.has(key)) missing.push(`${lang}: ${key} (${files.join(', ')})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
