import { describe, expect, it } from 'vitest';
import { expandTemplate, formatFromPath, getFormat, templateHasLanguage, type Entry } from '../src/formats/index.js';
import { CliError, ExitCode } from '../src/core/errors.js';

const entries: Entry[] = [
  { key: 'home.title', value: 'Welcome', description: 'Main heading' },
  { key: 'auth.login.submit', value: "Don't \"wait\" & <go>" },
  { key: 'dashboard.greeting', value: 'Hello, {{name}}! You have {{count}} items, {{name}}.' },
  { key: 'promo', value: '50% off for {{name}}' },
  { key: 'multi', value: 'Line 1\nLine 2' },
];

describe('flat json', () => {
  const f = getFormat('json');
  it('is sorted, pretty and ends with a newline', () => {
    const out = f.serialize(entries, 'en');
    expect(Object.keys(JSON.parse(out))).toEqual(['auth.login.submit', 'dashboard.greeting', 'home.title', 'multi', 'promo']);
    expect(out.endsWith('}\n')).toBe(true);
  });
  it('is deterministic (no timestamps) so pulls do not create diffs', () => {
    expect(f.serialize(entries, 'en')).toBe(f.serialize([...entries].reverse(), 'en'));
  });
  it('round-trips', () => {
    expect(f.parse(f.serialize(entries, 'en'), 'en')).toEqual(Object.fromEntries(entries.map(e => [e.key, e.value])));
  });
  it('parses nested JSON and strips a BOM', () => {
    expect(f.parse('﻿{"a":{"b":"x","c":{"d":"y"}}}', 'en')).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
  });
  it('rejects non-string values with the offending keys', () => {
    expect(() => f.parse('{"a":1,"b":{"c":[1]},"d":null}', 'en')).toThrow(/a \(number\)[\s\S]*b\.c \(array\)[\s\S]*d \(null\)/);
  });
  it('reports invalid JSON as a usage error', () => {
    try { f.parse('{oops', 'en'); throw new Error('no throw'); } catch (e) { expect((e as CliError).exitCode).toBe(ExitCode.Usage); }
  });
});

describe('nested json', () => {
  const f = getFormat('nested-json');
  it('nests by dots', () => {
    expect(JSON.parse(f.serialize([{ key: 'a.b', value: '1' }, { key: 'a.c', value: '2' }], 'en'))).toEqual({ a: { b: '1', c: '2' } });
  });
  it('refuses keys that are both a string and a parent instead of silently dropping one', () => {
    expect(() => f.serialize([{ key: 'a', value: '1' }, { key: 'a.b', value: '2' }], 'en')).toThrow(/can't be represented/);
    expect(() => f.serialize([{ key: 'a.b', value: '2' }, { key: 'a', value: '1' }], 'en')).toThrow(/can't be represented/);
  });
});

describe('android', () => {
  const f = getFormat('android');
  const out = f.serialize(entries, 'en');
  it('uses valid resource names', () => {
    expect(out).toContain('<string name="home_title">Welcome</string>');
    expect(out).not.toMatch(/name="[^"]*\./);
  });
  it('escapes apostrophes and quotes the Android way, and XML specials', () => {
    expect(out).toContain('<string name="auth_login_submit">Don\\\'t \\"wait\\" &amp; &lt;go&gt;</string>');
  });
  it('numbers placeholders by name (same name → same position) and doubles literal %', () => {
    expect(out).toContain('Hello, %1$s! You have %2$s items, %1$s.');
    expect(out).toContain('50%% off for %1$s');
  });
  it('escapes newlines and leading @ / ?', () => {
    expect(out).toContain('Line 1\\nLine 2');
    expect(f.serialize([{ key: 'k', value: '@handle' }], 'en')).toContain('>\\@handle<');
  });
  it('puts descriptions in comments safely', () => {
    expect(f.serialize([{ key: 'k', value: 'v', description: 'a -- b' }], 'en')).toContain('<!-- a - - b -->');
  });
  it('fails on name collisions instead of dropping strings', () => {
    expect(() => f.serialize([{ key: 'a.b', value: '1' }, { key: 'a_b', value: '2' }], 'en')).toThrow(/collide/);
  });
  it('parses what it writes (placeholders become positional)', () => {
    const parsed = f.parse(out, 'en');
    expect(parsed.auth_login_submit).toBe("Don't \"wait\" & <go>");
    expect(parsed.dashboard_greeting).toBe('Hello, {{1}}! You have {{2}} items, {{1}}.');
    expect(parsed.promo).toBe('50% off for {{1}}');
    expect(parsed.multi).toBe('Line 1\nLine 2');
  });
});

describe('ios', () => {
  const f = getFormat('ios');
  const out = f.serialize(entries, 'en');
  it('escapes and uses %n$@ placeholders', () => {
    expect(out).toContain('"auth.login.submit" = "Don\'t \\"wait\\" & <go>";');
    expect(out).toContain('"dashboard.greeting" = "Hello, %1$@! You have %2$@ items, %1$@.";');
    expect(out).toContain('/* Main heading */\n"home.title" = "Welcome";');
  });
  it('round-trips keys and text', () => {
    const parsed = f.parse(out, 'en');
    expect(parsed['home.title']).toBe('Welcome');
    expect(parsed['multi']).toBe('Line 1\nLine 2');
    expect(parsed['auth.login.submit']).toBe("Don't \"wait\" & <go>");
  });
});

describe('arb', () => {
  const f = getFormat('arb');
  const obj = JSON.parse(f.serialize(entries, 'pt-BR'));
  it('uses Dart-identifier message ids and the locale', () => {
    expect(obj['@@locale']).toBe('pt_BR');
    expect(obj.homeTitle).toBe('Welcome');
    expect(obj.authLoginSubmit).toBeDefined();
  });
  it('has no timestamp (deterministic output)', () => {
    expect(obj['@@last_modified']).toBeUndefined();
  });
  it('declares placeholders once each', () => {
    expect(obj.dashboardGreeting).toBe('Hello, {name}! You have {count} items, {name}.');
    expect(obj['@dashboardGreeting'].placeholders).toEqual({ name: { type: 'String' }, count: { type: 'String' } });
    expect(obj['@homeTitle'].description).toBe('Main heading');
  });
  it('parses simple placeholders but leaves ICU blocks alone', () => {
    expect(f.parse('{"@@locale":"en","a":"Hi {name}","b":"{count, plural, one{# item} other{# items}}","@a":{}}', 'en'))
      .toEqual({ a: 'Hi {{name}}', b: '{count, plural, one{# item} other{# items}}' });
  });
});

describe('format lookup & templates', () => {
  it('accepts 0.2.x format names', () => {
    for (const [alias, id] of [['flat-json', 'json'], ['json-nested', 'nested-json'], ['android-xml', 'android'], ['ios-strings', 'ios'], ['flutter', 'arb'], ['flutter-arb', 'arb']]) {
      expect(getFormat(alias).id).toBe(id);
    }
  });
  it('rejects unknown formats as usage errors', () => {
    expect(() => getFormat('yaml')).toThrow(/Unknown format/);
  });
  it('detects formats from extensions', () => {
    expect(formatFromPath('x/strings.xml').id).toBe('android');
    expect(formatFromPath('Localizable.strings').id).toBe('ios');
    expect(formatFromPath('app_en.arb').id).toBe('arb');
    expect(formatFromPath('en.JSON').id).toBe('json');
    expect(() => formatFromPath('en.yaml')).toThrow();
  });
  it('expands platform layouts', () => {
    expect(expandTemplate('res/{android}/strings.xml', 'en', 'en')).toBe('res/values/strings.xml');
    expect(expandTemplate('res/{android}/strings.xml', 'pt-BR', 'en')).toBe('res/values-pt-rBR/strings.xml');
    expect(expandTemplate('{lang}.lproj/Localizable.strings', 'pt-BR', 'en')).toBe('pt-BR.lproj/Localizable.strings');
    expect(expandTemplate('lib/l10n/app_{lang_}.arb', 'pt-BR', 'en')).toBe('lib/l10n/app_pt_BR.arb');
    expect(templateHasLanguage('out.json')).toBe(false);
    expect(templateHasLanguage('res/{android}/strings.xml')).toBe(true);
  });
});
