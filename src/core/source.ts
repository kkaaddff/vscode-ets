import type * as TS from 'typescript';

let tsModule: typeof TS | undefined;

/** 延迟加载 typescript：包体积较大，只在真正需要语法树时才初始化。 */
export function ts(): typeof TS {
  return (tsModule ??= require('typescript') as typeof TS);
}

const STRUCT = 'struct';
const CLASS = 'class';
const DELTA = STRUCT.length - CLASS.length;

/**
 * 可交给 TypeScript 解析的 ArkTS 源码。
 *
 * ArkTS 与 TypeScript 的语法差异中，唯一会破坏整体结构的是 `struct` 关键字，
 * 因此把 `struct` 替换为 `class` 后即可得到一棵基本准确的 TS 语法树。
 * 由于两者长度不同，需要在“生成文本”和“原始文本”之间做偏移映射。
 */
export class ArkSource {
  /** 生成文本中每个被替换的关键字（`class`）的起始位置，升序。 */
  private readonly generatedStructs: number[];

  private constructor(
    readonly original: string,
    readonly text: string,
    generatedStructs: number[],
  ) {
    this.generatedStructs = generatedStructs;
  }

  static from(original: string): ArkSource {
    const offsets = findStructKeywords(original);
    if (offsets.length === 0) return new ArkSource(original, original, []);
    let text = '';
    let last = 0;
    const generated: number[] = [];
    offsets.forEach((offset, i) => {
      text += original.slice(last, offset) + CLASS;
      generated.push(offset - i * DELTA);
      last = offset + STRUCT.length;
    });
    text += original.slice(last);
    return new ArkSource(original, text, generated);
  }

  /** 生成文本偏移 → 原始文本偏移。 */
  toOriginal(pos: number): number {
    let shift = 0;
    for (const g of this.generatedStructs) {
      if (g + CLASS.length <= pos) shift += DELTA;
      else break;
    }
    return pos + shift;
  }

  /** 原始文本偏移 → 生成文本偏移（落在 struct 关键字内部时取关键字起点）。 */
  toGenerated(pos: number): number {
    let shift = 0;
    for (const g of this.generatedStructs) {
      const originalStart = g + shift;
      if (pos >= originalStart + STRUCT.length) shift += DELTA;
      else if (pos > originalStart) return g;
      else break;
    }
    return pos - shift;
  }

  /** 生成文本中 [start, end) 区间是否与某个被替换的关键字内部重叠。 */
  overlapsKeyword(start: number, end: number): boolean {
    return this.generatedStructs.some((g) =>
      start === end ? start > g && start < g + CLASS.length : start < g + CLASS.length && end > g,
    );
  }

  /** 生成文本中位于 pos 的 `class` 关键字原本是否为 `struct`。 */
  isStructKeyword(pos: number): boolean {
    return this.generatedStructs.includes(pos);
  }
}

/**
 * 用 TS 扫描器找出作为声明关键字使用的 `struct`（`struct Name {`、`struct Name<T>`），
 * 自动跳过字符串、注释、模板字符串和正则。
 */
export function findStructKeywords(text: string): number[] {
  if (!text.includes(STRUCT)) return [];
  const t = ts();
  const K = t.SyntaxKind;
  const scanner = t.createScanner(t.ScriptTarget.Latest, true, t.LanguageVariant.Standard, text);
  const tokens: { kind: TS.SyntaxKind; pos: number; text: string }[] = [];
  const templateDepth: number[] = [];
  let braceDepth = 0;
  let prev: TS.SyntaxKind = K.Unknown;

  for (let kind = scanner.scan(); kind !== K.EndOfFileToken; kind = scanner.scan()) {
    if (kind === K.SlashToken || kind === K.SlashEqualsToken) {
      if (!endsExpression(prev)) kind = scanner.reScanSlashToken();
    } else if (kind === K.TemplateHead) {
      templateDepth.push(braceDepth);
    } else if (kind === K.OpenBraceToken) {
      braceDepth++;
    } else if (kind === K.CloseBraceToken) {
      if (templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === K.TemplateTail) templateDepth.pop();
      } else {
        braceDepth--;
      }
    }
    tokens.push({ kind, pos: scanner.getTokenStart(), text: scanner.getTokenText() });
    prev = kind;
  }

  const result: number[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind !== K.Identifier || tok.text !== STRUCT) continue;
    if (i > 0 && (tokens[i - 1].kind === K.DotToken || tokens[i - 1].kind === K.QuestionDotToken)) continue;
    const name = tokens[i + 1];
    const after = tokens[i + 2];
    if (!isIdentifierLike(name.kind) || name.text === STRUCT) continue;
    if (after.kind === K.OpenBraceToken || after.kind === K.LessThanToken ||
        after.kind === K.ExtendsKeyword || after.kind === K.ImplementsKeyword) {
      result.push(tok.pos);
    }
  }
  return result;

  function endsExpression(kind: TS.SyntaxKind): boolean {
    return (
      kind === K.Identifier || kind === K.CloseParenToken || kind === K.CloseBracketToken ||
      kind === K.CloseBraceToken || kind === K.StringLiteral || kind === K.NumericLiteral ||
      kind === K.BigIntLiteral || kind === K.NoSubstitutionTemplateLiteral || kind === K.TemplateTail ||
      kind === K.RegularExpressionLiteral || kind === K.ThisKeyword || kind === K.SuperKeyword ||
      kind === K.TrueKeyword || kind === K.FalseKeyword || kind === K.NullKeyword ||
      kind === K.PlusPlusToken || kind === K.MinusMinusToken
    );
  }

  function isIdentifierLike(kind: TS.SyntaxKind): boolean {
    return kind === K.Identifier || (kind >= K.FirstKeyword && kind <= K.LastKeyword);
  }
}

/** 解析结果：源码映射 + TS 语法树。 */
export interface ParsedArkTS {
  readonly source: ArkSource;
  readonly sourceFile: TS.SourceFile;
}

export function parseArkTS(text: string, fileName = 'file.ets'): ParsedArkTS {
  const t = ts();
  const source = ArkSource.from(text);
  const sourceFile = t.createSourceFile(`${fileName}.ts`, source.text, t.ScriptTarget.Latest, true, t.ScriptKind.TS);
  return { source, sourceFile };
}

/**
 * 尾随闭包之后的属性链 `}.width(100)`：TS 会把它解析成以缺失标识符开头的调用，
 * 或者跳过 `.` 之后解析成普通调用，两种情况都要识别。
 */
export function isAttributeChainStatement(st: TS.Statement, sf: TS.SourceFile): st is TS.ExpressionStatement {
  const t = ts();
  if (!t.isExpressionStatement(st)) return false;
  let e: TS.Expression = st.expression;
  while (t.isCallExpression(e) || t.isPropertyAccessExpression(e) || t.isNonNullExpression(e)) e = e.expression;
  if (t.isIdentifier(e) && e.text === '') return true;
  const text = sf.text;
  let i = st.getStart(sf) - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i >= 0 && text[i] === '.';
}
