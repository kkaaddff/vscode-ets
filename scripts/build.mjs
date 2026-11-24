// esbuild 打包脚本。
//   node scripts/build.mjs               开发构建（带 sourcemap）
//   node scripts/build.mjs --production  发布构建（压缩）
//   node scripts/build.mjs --watch       监听模式
//   node scripts/build.mjs --tests       构建单元测试到 out/test
import { build, context } from 'esbuild';
import { readdirSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');

/** @type {import('esbuild').BuildOptions} */
const extension = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  // jsonc-parser 的默认入口是 UMD 构建，内部的动态 require 无法被打包，需使用其 ESM 构建
  mainFields: ['module', 'main'],
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const tests = {
  entryPoints: readdirSync('test/unit')
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `test/unit/${f}`),
  outdir: 'out/test',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
};

const options = args.has('--tests') ? tests : extension;
if (args.has('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
