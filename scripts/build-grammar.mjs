// 基于微软官方 TypeScript TextMate 语法生成 ArkTS 语法。
//
// ArkTS 是 TypeScript 的超集（去掉了部分动态特性），所以直接复用 TS 语法能获得
// 最完整、最稳定的高亮效果；在此基础上补充 ArkTS 特有的语法：
//   - struct 声明（@Component struct Foo {}）
//   - 内置装饰器（@State、@Prop、@Builder ...）
//   - 内置组件 / 渲染控制（Column()、Text()、ForEach() ...）
//   - 资源引用（$r() / $rawfile()）与双向绑定（$$this.xxx）
//
// 用法：node scripts/build-grammar.mjs [--check]
//   --check  只校验生成结果是否与仓库中的文件一致（用于 CI）

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const ts = read('grammars/vendor/TypeScript.tmLanguage.json');
const decorators = read('src/data/decorators.json');
const { components, renderingControl } = read('src/data/components.json');

const SUFFIX = 'ets';
const REGEX_KEYS = new Set(['match', 'begin', 'end', 'while']);
const NAME_KEYS = new Set(['name', 'contentName']);

/** 正则替换，并断言替换次数，防止上游语法变化后补丁悄悄失效。 */
const regexPatches = [
  // 语句起始关键字列表（用于判断上一条语句/类型注解在哪里结束）
  { from: '|class|const|', to: '|class|const|struct|', min: 10 },
  // 箭头函数返回类型等位置的“下一个声明”前瞻
  { from: '(export|function|class|interface|', to: '(export|function|class|struct|interface|', min: 3 },
];
const patchCounts = regexPatches.map(() => 0);

function transform(node, key) {
  if (Array.isArray(node)) return node.map((n) => transform(n, key));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = transform(v, k);
    return out;
  }
  if (typeof node !== 'string') return node;
  if (NAME_KEYS.has(key)) return node.replace(/\.ts(?=\s|$)/g, `.${SUFFIX}`);
  if (key === 'include') return node.replace(/^source\.ts(?=#|$)/, 'source.ets');
  if (REGEX_KEYS.has(key)) {
    let s = node;
    regexPatches.forEach((p, i) => {
      const parts = s.split(p.from);
      patchCounts[i] += parts.length - 1;
      s = parts.join(p.to);
    });
    return s;
  }
  return node;
}

const g = transform(ts);
regexPatches.forEach((p, i) => {
  if (patchCounts[i] < p.min) {
    throw new Error(`正则补丁 "${p.from}" 只命中 ${patchCounts[i]} 次（期望 ≥ ${p.min}），上游语法可能已变化`);
  }
});

const repo = g.repository;
const ID = '[_$[:alpha:]][_$[:alnum:]]*';
const NOT_AFTER_ID = '(?<![_$[:alnum:]])(?:(?<=\\.\\.\\.)|(?<!\\.))';
const alt = (names) => [...names].sort((a, b) => b.length - a.length || a.localeCompare(b)).join('|');

function insertInclude(ruleName, include, { before, after }) {
  const patterns = repo[ruleName].patterns;
  const anchor = `#${before ?? after}`;
  const idx = patterns.findIndex((p) => p.include === anchor);
  if (idx < 0) throw new Error(`在 ${ruleName} 中找不到 ${anchor}`);
  patterns.splice(before ? idx : idx + 1, 0, { include });
}

// ---------------------------------------------------------------- struct
const classDecl = repo['class-declaration'];
if (!classDecl.begin.includes('\\b(class)\\b')) throw new Error('class-declaration 结构已变化');
repo['struct-declaration'] = {
  name: `meta.struct.${SUFFIX}`,
  begin:
    `${NOT_AFTER_ID}(?:(\\bexport)\\s+)?(?:(\\bdefault)\\s+)?(?:(\\bdeclare)\\s+)?` +
    `\\b(struct)\\b(?=\\s+${ID})`,
  beginCaptures: {
    1: { name: `keyword.control.export.${SUFFIX}` },
    2: { name: `keyword.control.default.${SUFFIX}` },
    3: { name: `storage.modifier.${SUFFIX}` },
    4: { name: `storage.type.struct.${SUFFIX}` },
  },
  end: '(?<=\\})',
  patterns: [{ include: '#class-declaration-or-expression-patterns' }],
};
insertInclude('declaration', '#struct-declaration', { after: 'class-declaration' });

// ---------------------------------------------------------------- 装饰器
const decoratorNames = alt(decorators.map((d) => d.name));
const componentNames = alt(components.map((c) => c.name));
const renderingNames = alt(renderingControl.map((c) => c.name));

repo['arkts-decorator-name'] = {
  patterns: [
    {
      // @Extend(Text) / @AnimatableExtend(Text)：参数是被扩展的内置组件
      match: `(?<=@)(Extend|AnimatableExtend)\\s*(\\()\\s*(${ID})\\s*(\\))`,
      captures: {
        1: { name: `support.function.decorator.arkts.${SUFFIX}` },
        2: { name: `meta.brace.round.${SUFFIX}` },
        3: { name: `support.class.component.arkts.${SUFFIX}` },
        4: { name: `meta.brace.round.${SUFFIX}` },
      },
    },
    {
      match: `(?<=@)(?:${decoratorNames})(?![_$[:alnum:]])`,
      name: `support.function.decorator.arkts.${SUFFIX}`,
    },
    {
      match: `(?<=@)${ID}(?=\\s*(?:\\(|$|\\s))`,
      name: `entity.name.function.decorator.${SUFFIX}`,
    },
  ],
};
repo.decorator.patterns.unshift({ include: '#arkts-decorator-name' });

// ---------------------------------------------------------------- 内置组件 / 资源 / 双向绑定
// 形如 `Column(`、`Repeat<number>(` 的调用；泛型实参交给 TS 的 type-arguments 规则
const TYPE_ARGS = '<(?:[^<>()]|<(?:[^<>()]|<[^<>()]*>)*>)*>';
const builtinCall = (names, name) => ({
  match: `${NOT_AFTER_ID}(${names})\\s*(${TYPE_ARGS})?(?=\\s*\\()`,
  captures: { 1: { name }, 2: { patterns: [{ include: '#type-arguments' }] } },
});
repo['arkts-builtins'] = {
  patterns: [
    {
      // $$this.value / $$value：双向绑定语法糖
      match: `(\\$\\$)(?:(this)|(${ID}))(?![_$[:alnum:]])`,
      captures: {
        1: { name: `keyword.operator.binding.arkts.${SUFFIX}` },
        2: { name: `variable.language.this.${SUFFIX}` },
        3: { name: `variable.other.readwrite.${SUFFIX}` },
      },
    },
    {
      match: `${NOT_AFTER_ID}(\\$r|\\$rawfile)(?=\\s*\\()`,
      captures: { 1: { name: `support.function.resource.arkts.${SUFFIX}` } },
    },
    builtinCall(renderingNames, `support.function.rendering-control.arkts.${SUFFIX}`),
    builtinCall(componentNames, `support.class.component.arkts.${SUFFIX}`),
  ],
};
insertInclude('expressionWithoutIdentifiers', '#arkts-builtins', { before: 'function-call' });

// ---------------------------------------------------------------- 输出
const upstream = String(ts.version ?? '');
const grammar = {
  information_for_contributors: [
    '本文件由 scripts/build-grammar.mjs 自动生成，请勿手动修改。',
    `基于 microsoft/TypeScript-TmLanguage（MIT License）：${upstream}`,
  ],
  name: 'ArkTS',
  scopeName: 'source.ets',
  patterns: g.patterns,
  repository: Object.fromEntries(Object.entries(repo).sort(([a], [b]) => a.localeCompare(b))),
};

const outFile = join(root, 'syntaxes/arkts.tmLanguage.json');
const content = JSON.stringify(grammar, null, '\t') + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(outFile) || readFileSync(outFile, 'utf8') !== content) {
    console.error('syntaxes/arkts.tmLanguage.json 已过期，请运行 npm run build:grammar');
    process.exit(1);
  }
  console.log('grammar is up to date');
} else {
  writeFileSync(outFile, content);
  console.log(`generated ${outFile.slice(root.length + 1)} (${(content.length / 1024).toFixed(0)} KB)`);
}
