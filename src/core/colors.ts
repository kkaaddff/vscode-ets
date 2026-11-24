import type * as TS from 'typescript';
import { ParsedArkTS, ts } from './source';

/** 0~1 的 RGBA。 */
export interface RGBA {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** ArkUI `Color` 枚举。 */
export const COLOR_ENUM: Readonly<Record<string, string>> = {
  White: '#FFFFFF',
  Black: '#000000',
  Blue: '#0000FF',
  Brown: '#A52A2A',
  Gray: '#808080',
  Grey: '#808080',
  Green: '#008000',
  Orange: '#FFA500',
  Pink: '#FFC0CB',
  Red: '#FF0000',
  Yellow: '#FFFF00',
  Transparent: '#00000000',
};

/**
 * 解析 ArkTS 颜色字符串。注意 ArkTS 的透明度在前：`#ARGB` / `#AARRGGBB`。
 * 同时支持 `rgb()` / `rgba()`。
 */
export function parseArkColor(value: string): RGBA | undefined {
  const s = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return h.length === 8
      ? { alpha: n(0), red: n(2), green: n(4), blue: n(6) }
      : { alpha: 1, red: n(0), green: n(2), blue: n(4) };
  }
  const fn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (fn) {
    const c = (v: string) => Math.min(255, Number(v)) / 255;
    const alpha = fn[4] === undefined ? 1 : Math.min(1, Number(fn[4]));
    if (Number.isNaN(alpha)) return undefined;
    return { red: c(fn[1]), green: c(fn[2]), blue: c(fn[3]), alpha };
  }
  return undefined;
}

/** 数字颜色：`0xRRGGBB`，大于 0xFFFFFF 时视为 `0xAARRGGBB`。 */
export function parseNumberColor(value: number): RGBA | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return undefined;
  const byte = (shift: number) => ((value >>> shift) & 0xff) / 255;
  return { alpha: value > 0xffffff ? byte(24) : 1, red: byte(16), green: byte(8), blue: byte(0) };
}

const hex2 = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** 格式化为 ArkTS 颜色：不透明时 `#RRGGBB`，否则 `#AARRGGBB`。 */
export function formatArkColor(c: RGBA): string {
  const rgb = hex2(c.red) + hex2(c.green) + hex2(c.blue);
  return hex2(c.alpha) === 'FF' ? `#${rgb}` : `#${hex2(c.alpha)}${rgb}`;
}

export function formatNumberColor(c: RGBA): string {
  const rgb = hex2(c.red) + hex2(c.green) + hex2(c.blue);
  return hex2(c.alpha) === 'FF' ? `0x${rgb}` : `0x${hex2(c.alpha)}${rgb}`;
}

export type ColorKind = 'string' | 'number' | 'enum' | 'resource';

export interface ColorOccurrence {
  kind: ColorKind;
  /** 原文中的区间：字符串为内容（不含引号），其他为整个表达式。 */
  start: number;
  end: number;
  color?: RGBA;
  /** kind 为 resource 时的资源名（`app.color.xxx` 中的 xxx）。 */
  resourceName?: string;
}

/** 参数可以是数字颜色的方法，避免把普通十六进制数当作颜色。 */
const COLOR_METHOD = /colou?r$/i;

/** 查找源码中的颜色：字符串字面量、`Color.Xxx`、颜色方法中的十六进制数字、`$r('app.color.xxx')`。 */
export function findColors({ source, sourceFile: sf }: ParsedArkTS): ColorOccurrence[] {
  const t = ts();
  const out: ColorOccurrence[] = [];
  const range = (node: TS.Node, inset = 0) => ({
    start: source.toOriginal(node.getStart(sf) + inset),
    end: source.toOriginal(node.getEnd() - inset),
  });

  const visit = (node: TS.Node): void => {
    if (t.isStringLiteral(node) || t.isNoSubstitutionTemplateLiteral(node)) {
      const color = /^(#|rgb)/i.test(node.text) ? parseArkColor(node.text) : undefined;
      if (color) out.push({ kind: 'string', ...range(node, 1), color });
    } else if (
      t.isPropertyAccessExpression(node) &&
      t.isIdentifier(node.expression) &&
      node.expression.text === 'Color' &&
      Object.hasOwn(COLOR_ENUM, node.name.text)
    ) {
      out.push({ kind: 'enum', ...range(node), color: parseArkColor(COLOR_ENUM[node.name.text]) });
    } else if (t.isNumericLiteral(node) && /^0x/i.test(node.getText(sf)) && isColorArgument(node)) {
      const color = parseNumberColor(Number(node.text));
      if (color) out.push({ kind: 'number', ...range(node), color });
    } else if (t.isCallExpression(node) && t.isIdentifier(node.expression) && node.expression.text === '$r') {
      const arg = node.arguments[0];
      const m = arg && t.isStringLiteral(arg) ? /^app\.color\.(.+)$/.exec(arg.text) : null;
      if (m) out.push({ kind: 'resource', ...range(node), resourceName: m[1] });
    }
    t.forEachChild(node, visit);
  };
  visit(sf);
  return out;

  function isColorArgument(node: TS.Node): boolean {
    const call = node.parent;
    if (!call || !t.isCallExpression(call)) return false;
    const callee = call.expression;
    const name = t.isPropertyAccessExpression(callee) ? callee.name.text : t.isIdentifier(callee) ? callee.text : '';
    return COLOR_METHOD.test(name);
  }
}
