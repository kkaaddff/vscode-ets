import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArkSource, findStructKeywords, parseArkTS, ts } from '../../src/core/source';

test('findStructKeywords: 只识别声明位置的 struct', () => {
  const text = [
    '@Component struct A {}',
    'export struct B<T> {}',
    "const s = 'struct C {}';",
    '// struct D {}',
    '/* struct E {} */',
    'const t = `struct F {} ${x} struct G {}`;',
    'const r = /struct H {/;',
    'obj.struct = 1;',
    'const struct = 2;',
    'struct I extends J {}',
  ].join('\n');
  const found = findStructKeywords(text).map((pos) => text.slice(pos, text.indexOf('\n', pos) >>> 0).split(/[ <{]/)[1]);
  assert.deepEqual(found, ['A', 'B', 'I']);
});

test('ArkSource: struct → class 后偏移可以双向映射', () => {
  const text = 'struct A {\n  x = 1\n}\nstruct B { y = 2 }';
  const source = ArkSource.from(text);
  assert.equal(source.text, 'class A {\n  x = 1\n}\nclass B { y = 2 }');
  for (const word of ['A', 'x', 'B', 'y', '2']) {
    const original = text.indexOf(word);
    const generated = source.text.indexOf(word);
    assert.equal(source.toGenerated(original), generated, `toGenerated(${word})`);
    assert.equal(source.toOriginal(generated), original, `toOriginal(${word})`);
  }
  // 落在 struct 关键字内部时取关键字起点
  assert.equal(source.toGenerated(text.indexOf('struct B') + 3), source.text.indexOf('class B'));
  assert.ok(source.isStructKeyword(source.text.indexOf('class B')));
  assert.ok(source.overlapsKeyword(source.text.indexOf('class B') + 1, source.text.indexOf('class B') + 2));
  assert.ok(!source.overlapsKeyword(source.text.indexOf('{'), source.text.indexOf('{') + 1));
});

test('ArkSource: 没有 struct 时原样返回', () => {
  const source = ArkSource.from('class A {}');
  assert.equal(source.text, 'class A {}');
  assert.equal(source.toOriginal(5), 5);
});

test('parseArkTS: struct 被解析为类声明', () => {
  const { sourceFile } = parseArkTS('@Component\nstruct A {\n  build() {}\n}');
  assert.equal(sourceFile.statements.length, 1);
  const decl = sourceFile.statements[0];
  assert.ok(ts().isClassDeclaration(decl));
  assert.equal(decl.name?.text, 'A');
  assert.equal(decl.members.length, 1);
  assert.equal((sourceFile as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length, 0);
});
