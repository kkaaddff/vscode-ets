import * as vscode from 'vscode';
import { COLOR_ENUM, findColors, formatArkColor, formatNumberColor, parseArkColor, RGBA } from '../core/colors';
import { DocumentCache, toRange } from './documents';
import { ResourceIndex } from './resourceIndex';

const toVscode = (c: RGBA) => new vscode.Color(c.red, c.green, c.blue, c.alpha);

/**
 * 颜色选择器。ArkTS 的 8 位十六进制颜色是 `#AARRGGBB`（透明度在前），
 * 与 CSS 的 `#RRGGBBAA` 不同，所以需要自己实现而不是依赖通用的颜色装饰。
 */
export class ArkColorProvider implements vscode.DocumentColorProvider {
  constructor(
    private readonly cache: DocumentCache,
    private readonly index: ResourceIndex,
  ) {}

  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    if (!vscode.workspace.getConfiguration('arkts', document).get<boolean>('colorDecorators', true)) return [];
    const result: vscode.ColorInformation[] = [];
    for (const occ of findColors(this.cache.get(document))) {
      let color = occ.color;
      if (occ.kind === 'resource' && occ.resourceName) {
        const value = this.index.resolveColor(occ.resourceName);
        color = value ? parseArkColor(value) : undefined;
      }
      if (color) result.push(new vscode.ColorInformation(toRange(document, occ.start, occ.end), toVscode(color)));
    }
    return result;
  }

  provideColorPresentations(color: vscode.Color, context: { document: vscode.TextDocument; range: vscode.Range }): vscode.ColorPresentation[] {
    const original = context.document.getText(context.range);
    const rgba: RGBA = { red: color.red, green: color.green, blue: color.blue, alpha: color.alpha };
    const hex = formatArkColor(rgba);

    // 资源引用只展示颜色，不改写源码
    if (original.startsWith('$r')) return [new vscode.ColorPresentation(original)];

    if (/^0x/i.test(original)) return [new vscode.ColorPresentation(formatNumberColor(rgba))];

    if (original.startsWith('Color.')) {
      const presentations: vscode.ColorPresentation[] = [];
      const name = Object.keys(COLOR_ENUM).find((k) => formatArkColor(parseArkColor(COLOR_ENUM[k])!) === hex);
      if (name) presentations.push(new vscode.ColorPresentation(`Color.${name}`));
      presentations.push(new vscode.ColorPresentation(`'${hex}'`));
      return presentations;
    }

    const presentations = [new vscode.ColorPresentation(hex)];
    const b = (v: number) => Math.round(v * 255);
    const rgbText =
      color.alpha >= 1
        ? `rgb(${b(color.red)}, ${b(color.green)}, ${b(color.blue)})`
        : `rgba(${b(color.red)}, ${b(color.green)}, ${b(color.blue)}, ${Number(color.alpha.toFixed(2))})`;
    // 保持用户原本的写法优先
    if (/^rgb/i.test(original)) presentations.unshift(new vscode.ColorPresentation(rgbText));
    else presentations.push(new vscode.ColorPresentation(rgbText));
    return presentations;
  }
}
