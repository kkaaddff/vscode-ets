import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as TS from 'typescript';
import { applyEdits, formatArkTS } from '../../src/core/format';
import { SAMPLE } from './helpers';

const SETTINGS: TS.FormatCodeSettings = {
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  newLineCharacter: '\n',
  insertSpaceAfterCommaDelimiter: true,
  insertSpaceBeforeAndAfterBinaryOperators: true,
  insertSpaceAfterKeywordsInControlFlowStatements: true,
  insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
  insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: false,
};

const format = (text: string, settings: TS.FormatCodeSettings = SETTINGS) => applyEdits(text, formatArkTS(text, settings));
const lines = (...l: string[]) => l.join('\n') + '\n';

test('格式化：示例文件已是规范格式，不产生修改', () => {
  assert.equal(format(SAMPLE), SAMPLE);
});

test('格式化：struct、尾随闭包与属性链', () => {
  const input = lines(
    '@Component',
    'struct   Foo {',
    '@State   n:number=0',
    'build(){',
    'Column(){',
    "Button('a')",
    '.onClick(()=>{',
    'this.n++',
    '})',
    'Row(){',
    "Text('x')",
    '}',
    '.width({',
    'a:1',
    '})',
    '.onClick(() => {',
    'Column() {',
    "Text('y')",
    '}',
    '.padding(4)',
    '.margin(2)',
    '})',
    '.height(2)',
    "}.width('100%')",
    '.height(3)',
    '}',
    '}',
  );
  const expected = lines(
    '@Component',
    'struct Foo {',
    '  @State n: number = 0',
    '  build() {',
    '    Column() {',
    "      Button('a')",
    '        .onClick(() => {',
    '          this.n++',
    '        })',
    '      Row() {',
    "        Text('x')",
    '      }',
    '      .width({',
    '        a: 1',
    '      })',
    '      .onClick(() => {',
    '        Column() {',
    "          Text('y')",
    '        }',
    '        .padding(4)',
    '        .margin(2)',
    '      })',
    '      .height(2)',
    "    }.width('100%')",
    '    .height(3)',
    '  }',
    '}',
  );
  const output = format(input);
  assert.equal(output, expected);
  assert.equal(format(output), output, '格式化应当幂等');
});

test('格式化：@Extend / @Styles 函数体中的属性链', () => {
  const input = lines('@Extend(Text) function f(){', '.fontSize(1)', '    .fontColor(Color.Red)', '}');
  assert.equal(format(input), lines('@Extend(Text) function f() {', '  .fontSize(1)', '  .fontColor(Color.Red)', '}'));
});

test('格式化：插入分号时不破坏尾随闭包', () => {
  const input = lines('struct A {', '  build() {', '    Column()', '    {', "      Text('a')", '    }', '    .width(1)', '  }', '}');
  const output = format(input, { ...SETTINGS, semicolons: 'insert' as TS.SemicolonPreference });
  assert.match(output, /Column\(\)\n/);
  assert.match(output, /Text\('a'\);/);
  assert.match(output, /\.width\(1\);/);
});

test('格式化：使用 Tab 缩进', () => {
  const input = lines('struct A {', 'build() {', 'Row() {', '}', '.width(1)', '.height(2)', '}', '}');
  const output = format(input, { ...SETTINGS, convertTabsToSpaces: false, indentSize: 4, tabSize: 4 });
  assert.equal(output, lines('struct A {', '\tbuild() {', '\t\tRow() {', '\t\t}', '\t\t.width(1)', '\t\t.height(2)', '\t}', '}'));
});

test('格式化：只格式化选区', () => {
  const input = lines('struct A {', 'build() {', 'Row(){', '}', '}', 'x(){', 'a=1', '}', '}');
  const start = input.indexOf('x(){');
  const end = input.indexOf('a=1') + 3;
  const output = applyEdits(input, formatArkTS(input, SETTINGS, { start, end }));
  assert.ok(output.startsWith('struct A {\nbuild() {\nRow(){\n'), '选区之外保持不变');
  assert.match(output, / {2}x\(\) \{\n {4}a = 1\n/);
});

test('格式化：CRLF 换行', () => {
  const input = 'struct A {\r\nbuild() {\r\nRow() {\r\n}\r\n.width(1)\r\n.height(2)\r\n}\r\n}\r\n';
  const output = format(input, { ...SETTINGS, newLineCharacter: '\r\n' });
  assert.equal(output, 'struct A {\r\n  build() {\r\n    Row() {\r\n    }\r\n    .width(1)\r\n    .height(2)\r\n  }\r\n}\r\n');
});
