// 调试工具：打印文件的 TextMate 分词结果。用法：node scripts/tokenize.mjs <file.ets>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
await oniguruma.loadWASM(wasm);
const registry = new vsctm.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (s) => new oniguruma.OnigScanner(s),
    createOnigString: (s) => new oniguruma.OnigString(s),
  }),
  loadGrammar: async (scope) =>
    scope === 'source.ets'
      ? vsctm.parseRawGrammar(readFileSync(join(root, 'syntaxes/arkts.tmLanguage.json'), 'utf8'), 'x.json')
      : null,
});
const grammar = await registry.loadGrammar('source.ets');
let stack = vsctm.INITIAL;
for (const [i, line] of readFileSync(process.argv[2], 'utf8').split('\n').entries()) {
  const r = grammar.tokenizeLine(line, stack);
  stack = r.ruleStack;
  if (!line.trim()) continue;
  console.log(`${i + 1}: ${line}`);
  for (const t of r.tokens) {
    const text = line.slice(t.startIndex, t.endIndex);
    if (!text.trim()) continue;
    const scopes = t.scopes.slice(1).filter((s) => !/^meta\.(block|class|struct|method|function|var|paren|object|decorator|arrow|brace|parameters|definition|objectliteral|array|return|type|field|import|export|block)/.test(s));
    console.log(`   ${JSON.stringify(text).padEnd(22)} ${scopes.join(' ')}`);
  }
}
