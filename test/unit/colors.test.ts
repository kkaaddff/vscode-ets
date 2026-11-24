import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findColors, formatArkColor, formatNumberColor, parseArkColor, parseNumberColor, RGBA } from '../../src/core/colors';
import { parseArkTS } from '../../src/core/source';

const bytes = (c: RGBA | undefined) => c && [c.alpha, c.red, c.green, c.blue].map((v) => Math.round(v * 255));

test('parseArkColor: ArkTS 的透明度在前（#AARRGGBB）', () => {
  assert.deepEqual(bytes(parseArkColor('#FF0000')), [255, 255, 0, 0]);
  assert.deepEqual(bytes(parseArkColor('#80FF0000')), [128, 255, 0, 0]);
  assert.deepEqual(bytes(parseArkColor('#F00')), [255, 255, 0, 0]);
  assert.deepEqual(bytes(parseArkColor('#8F00')), [136, 255, 0, 0]);
  assert.deepEqual(bytes(parseArkColor('rgb(0, 128, 255)')), [255, 0, 128, 255]);
  assert.deepEqual(bytes(parseArkColor('rgba(0, 0, 0, 0.5)')), [128, 0, 0, 0]);
  assert.equal(parseArkColor('#12345'), undefined);
  assert.equal(parseArkColor('red'), undefined);
});

test('formatArkColor: 不透明时省略透明度', () => {
  assert.equal(formatArkColor({ red: 1, green: 0, blue: 0, alpha: 1 }), '#FF0000');
  assert.equal(formatArkColor({ red: 1, green: 0, blue: 0, alpha: 0.5 }), '#80FF0000');
  assert.equal(formatArkColor(parseArkColor('#33000000')!), '#33000000');
});

test('数字颜色：0xRRGGBB 与 0xAARRGGBB', () => {
  assert.deepEqual(bytes(parseNumberColor(0xff0000)), [255, 255, 0, 0]);
  assert.deepEqual(bytes(parseNumberColor(0x80ff0000)), [128, 255, 0, 0]);
  assert.equal(formatNumberColor({ red: 0, green: 0, blue: 1, alpha: 1 }), '0x0000FF');
  assert.equal(parseNumberColor(-1), undefined);
});

test('findColors: 字符串、Color 枚举、颜色方法中的数字、颜色资源', () => {
  const text = [
    'struct A {',
    '  build() {',
    "    Text('#hello').fontColor('#80FF0000')",
    '      .backgroundColor(Color.Red)',
    '      .borderColor(0x00FF00)',
    '      .width(0xFF)',
    "      .shadow({ color: $r('app.color.shadow') })",
    "    Text($r('app.string.ok'))",
    '  }',
    '}',
  ].join('\n');
  const colors = findColors(parseArkTS(text));
  assert.deepEqual(
    colors.map((c) => [c.kind, text.slice(c.start, c.end), c.resourceName ?? bytes(c.color)]),
    [
      ['string', '#80FF0000', [128, 255, 0, 0]],
      ['enum', 'Color.Red', [255, 255, 0, 0]],
      ['number', '0x00FF00', [255, 0, 255, 0]],
      ['resource', "$r('app.color.shadow')", 'shadow'],
    ],
  );
});
