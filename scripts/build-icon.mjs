// 由 assets/icon.svg 生成扩展市场图标 assets/icon.png（vsce 不接受 SVG 图标）。
// 该 PNG 是构建产物，不入库，打包时由 vscode:prepublish 自动生成。
// 用法：node scripts/build-icon.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets/icon.svg'));
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
writeFileSync(join(root, 'assets/icon.png'), png);
console.log(`generated assets/icon.png (256×256, ${(png.length / 1024).toFixed(1)} KB)`);
