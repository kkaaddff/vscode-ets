import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArkTS } from '../../src/core/source';
import { ArkSymbol, documentSymbols } from '../../src/core/symbols';
import { SAMPLE } from './helpers';

const outline = (text: string) => documentSymbols(parseArkTS(text));
const tree = (symbols: ArkSymbol[]): unknown[] =>
  symbols.map((s) => (s.children.length ? [`${s.kind}:${s.name}`, tree(s.children)] : `${s.kind}:${s.name}`));
const find = (symbols: ArkSymbol[], name: string): ArkSymbol => {
  for (const s of symbols) {
    if (s.name === name) return s;
    const child = s.children.length ? find(s.children, name) : undefined;
    if (child) return child;
  }
  return undefined as never;
};

test('大纲：顶层声明与装饰器信息', () => {
  const symbols = outline(SAMPLE);
  assert.deepEqual(
    symbols.map((s) => `${s.kind}:${s.name}`),
    ['class:Task', 'function:fancy', 'function:pressed', 'function:Header', 'struct:Index', 'struct:Child'],
  );
  const index = find(symbols, 'Index');
  assert.equal(index.detail, '@Entry @Component');
  assert.equal(find(index.children, 'message').detail, '@State string');
  assert.equal(find(symbols, 'double').kind, 'getter');
});

test('大纲：build() 展开为组件树，属性链不产生节点', () => {
  const text = [
    '@Component',
    'struct A {',
    '  build() {',
    '    Column() {',
    '      Text("a").fontSize(12)',
    '      if (this.ok) {',
    '        Button("b")',
    '      } else {',
    '        Blank()',
    '      }',
    '      ForEach(this.list, (item: string) => {',
    '        Text(item)',
    '      })',
    '    }',
    '    .width("100%")',
    '    .height("100%")',
    '  }',
    '}',
  ].join('\n');
  const symbols = outline(text);
  assert.deepEqual(tree(symbols), [
    [
      'struct:A',
      [
        [
          'method:build',
          [
            [
              'component:Column',
              [
                'component:Text',
                ['condition:if (this.ok)', ['component:Button']],
                ['condition:else', ['component:Blank']],
                ['renderingControl:ForEach', ['component:Text']],
              ],
            ],
          ],
        ],
      ],
    ],
  ]);
  // Column 的范围覆盖尾随闭包和属性链
  const column = find(symbols, 'Column');
  assert.ok(text.slice(column.start, column.end).endsWith('.height("100%")'));
});

test('大纲：选中区间位于范围内且偏移正确映射回 struct 原文', () => {
  const text = 'struct A {}\nstruct B {\n  x: number = 1\n}';
  const [a, b] = outline(text);
  assert.equal(text.slice(a.selectionStart, a.selectionEnd), 'A');
  assert.equal(text.slice(b.selectionStart, b.selectionEnd), 'B');
  assert.equal(text.slice(b.start, b.end), 'struct B {\n  x: number = 1\n}');
  assert.equal(text.slice(b.children[0].selectionStart, b.children[0].selectionEnd), 'x');
});
