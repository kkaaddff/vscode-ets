import type * as TS from 'typescript';
import { ArkSource, isAttributeChainStatement, ts } from './source';

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

const FILE = '/arkts-format.ts';

/** 只做语法级工作的单文件 LanguageService，复用以避免重复初始化。 */
class FormatHost implements TS.LanguageServiceHost {
  text = '';
  version = 0;

  getCompilationSettings(): TS.CompilerOptions {
    return {};
  }
  getScriptFileNames(): string[] {
    return [FILE];
  }
  getScriptVersion(): string {
    return String(this.version);
  }
  getScriptSnapshot(fileName: string): TS.IScriptSnapshot | undefined {
    return fileName === FILE ? ts().ScriptSnapshot.fromString(this.text) : undefined;
  }
  getCurrentDirectory(): string {
    return '/';
  }
  getDefaultLibFileName(): string {
    return '/lib.d.ts';
  }
  fileExists(fileName: string): boolean {
    return fileName === FILE;
  }
  readFile(fileName: string): string | undefined {
    return fileName === FILE ? this.text : undefined;
  }
}

let host: FormatHost | undefined;
let service: TS.LanguageService | undefined;

function languageService(text: string): TS.LanguageService {
  const t = ts();
  host ??= new FormatHost();
  service ??= t.createLanguageService(host, t.createDocumentRegistry(), t.LanguageServiceMode.Syntactic);
  host.text = text;
  host.version++;
  return service;
}

/**
 * 使用 TypeScript 格式化引擎格式化 ArkTS 源码。
 * 传入 range（原始文本偏移）时只格式化该区间。
 */
export function formatArkTS(
  text: string,
  settings: TS.FormatCodeSettings,
  range?: { start: number; end: number },
): TextEdit[] {
  const t = ts();
  const source = ArkSource.from(text);
  const sf = t.createSourceFile(FILE, source.text, t.ScriptTarget.Latest, true, t.ScriptKind.TS);
  const layout = analyzeLayout(sf);

  // 属性链开头的 `.` 换成等长的 `_`，让 TS 把它当成普通调用语句来缩进
  let formatText = source.text;
  for (const dot of layout.chainDots) formatText = formatText.slice(0, dot) + '_' + formatText.slice(dot + 1);

  const ls = languageService(formatText);
  const generatedRange = range && { start: source.toGenerated(range.start), end: source.toGenerated(range.end) };
  const tsEdits = generatedRange
    ? ls.getFormattingEditsForRange(FILE, generatedRange.start, generatedRange.end, settings)
    : ls.getFormattingEditsForDocument(FILE, settings);

  const fixer = new LayoutFixer(source.text, sf.getLineStarts(), settings, generatedRange);
  const edits = fixer.apply(
    tsEdits.map((e) => ({ start: e.span.start, end: e.span.start + e.span.length, newText: e.newText })),
    layout,
  );

  const result: TextEdit[] = [];
  for (const e of edits) {
    // 编辑落在被替换的 struct 关键字内部时无法安全映射回原文，丢弃（实际不会出现）
    if (source.overlapsKeyword(e.start, e.end)) continue;
    result.push({ start: source.toOriginal(e.start), end: source.toOriginal(e.end), newText: e.newText });
  }
  return result;
}

/** ArkUI 特有的、TS 格式化引擎不认识的布局信息。 */
interface Layout {
  /** 属性链开头的 `.`（`}.width()`、`@Extend` 函数体中的 `.fontSize()`）。 */
  chainDots: Set<number>;
  /** 每条属性链中需要回退一级缩进的行区间 [first, last]。 */
  dedentRanges: [number, number][];
  /** 尾随闭包 `Column() {` 中 `)` 与 `{` 之间的空白区间（同一行时）。 */
  closureGaps: [number, number][];
  /** 尾随闭包前调用表达式的结束位置，这里不能插入分号。 */
  closureCalls: Set<number>;
}

function analyzeLayout(sf: TS.SourceFile): Layout {
  const t = ts();
  const text = sf.text;
  const layout: Layout = { chainDots: new Set(), dedentRanges: [], closureGaps: [], closureCalls: new Set() };
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line;

  const visitStatements = (statements: readonly TS.Statement[]): void => {
    statements.forEach((st, i) => {
      if (isAttributeChainStatement(st, sf)) {
        const start = st.getStart(sf);
        const dot = text[start] === '.' ? start : previousNonSpace(start);
        if (text[dot] === '.') layout.chainDots.add(dot);
        const first = continuationLine(st);
        if (first !== undefined) layout.dedentRanges.push([first, lineOf(st.getEnd())]);
      }
      const next = statements[i + 1];
      if (t.isExpressionStatement(st) && next && t.isBlock(next) && t.isCallExpression(st.expression)) {
        const gapStart = st.getEnd();
        const gapEnd = next.getStart(sf);
        if (text[gapStart - 1] !== ';') layout.closureCalls.add(gapStart);
        if (/^[ \t]*$/.test(text.slice(gapStart, gapEnd))) layout.closureGaps.push([gapStart, gapEnd]);
      }
    });
  };

  const visit = (node: TS.Node): void => {
    if (t.isBlock(node) || t.isSourceFile(node) || t.isModuleBlock(node)) visitStatements(node.statements);
    else if (t.isCaseClause(node) || t.isDefaultClause(node)) visitStatements(node.statements);
    t.forEachChild(node, visit);
  };
  visit(sf);
  return layout;

  function previousNonSpace(pos: number): number {
    let i = pos - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    return i;
  }

  /** 属性链中第一个以 `.` 开头、且不在语句首行的续行；TS 会把它及之后的行多缩进一级。 */
  function continuationLine(st: TS.ExpressionStatement): number | undefined {
    const lineStarts = sf.getLineStarts();
    const startLine = lineOf(st.getStart(sf));
    let result: number | undefined;
    let e: TS.Expression = st.expression;
    while (t.isCallExpression(e) || t.isPropertyAccessExpression(e) || t.isNonNullExpression(e)) {
      if (t.isPropertyAccessExpression(e)) {
        const nameStart = e.name.getStart(sf);
        const line = lineOf(nameStart);
        let p = lineStarts[line];
        while (text[p] === ' ' || text[p] === '\t') p++;
        if (line > startLine && p < nameStart && (text[p] === '.' || text.startsWith('?.', p))) result = line;
      }
      e = e.expression;
    }
    return result;
  }
}

/** 在 TS 格式化结果的基础上应用 ArkTS 约定。 */
class LayoutFixer {
  private readonly indentSize: number;
  private readonly tabSize: number;

  constructor(
    private readonly text: string,
    private readonly lineStarts: readonly number[],
    private readonly settings: TS.FormatCodeSettings,
    private readonly range: { start: number; end: number } | undefined,
  ) {
    this.indentSize = settings.indentSize ?? 4;
    this.tabSize = settings.tabSize ?? this.indentSize;
  }

  apply(tsEdits: TextEdit[], layout: Layout): TextEdit[] {
    const { text } = this;
    // TS 会在 `}` 与 `_width` 之间补空格，这对属性链是错误的：丢弃行内（非缩进）的此类编辑
    let edits = tsEdits.filter((e) => !(layout.chainDots.has(e.end) && !this.isIndentation(e.start)));
    // `Column()` 后面紧跟尾随闭包，插入分号会改变语义
    edits = edits.filter((e) => !(layout.closureCalls.has(e.start) && e.newText.includes(';')));

    // 尾随闭包：`Column(){` → `Column() {`
    for (const [gapStart, gapEnd] of layout.closureGaps) {
      if (!this.inRange(gapStart)) continue;
      edits = edits.filter((e) => e.end < gapStart || e.start > gapEnd);
      if (text.slice(gapStart, gapEnd) !== ' ') edits.push({ start: gapStart, end: gapEnd, newText: ' ' });
    }

    // 属性链续行与首行对齐
    const levels = new Map<number, number>();
    for (const [first, last] of layout.dedentRanges) {
      for (let line = first; line <= last; line++) levels.set(line, (levels.get(line) ?? 0) + 1);
    }
    for (const [line, level] of levels) edits = this.dedentLine(edits, line, level);

    return edits.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  private dedentLine(edits: TextEdit[], line: number, level: number): TextEdit[] {
    const { text } = this;
    const ls = this.lineStarts[line];
    let le = ls;
    while (text[le] === ' ' || text[le] === '\t') le++;
    if (le >= text.length || text[le] === '\n' || text[le] === '\r' || !this.inRange(ls)) return edits;

    // 先应用 TS 对这段前导空白的修改，得到 TS 认为的缩进
    const inside = edits.filter((e) => e.start >= ls && e.end <= le && (e.start < le || e.start === ls));
    if (inside.some((e) => /[^ \t]/.test(e.newText))) return edits;
    let ws = text.slice(ls, le);
    for (const e of [...inside].sort((a, b) => b.start - a.start)) {
      ws = ws.slice(0, e.start - ls) + e.newText + ws.slice(e.end - ls);
    }
    const column = Math.max(0, columnOf(ws, this.tabSize) - level * this.indentSize);
    const indent =
      this.settings.convertTabsToSpaces === false
        ? '\t'.repeat(Math.floor(column / this.tabSize)) + ' '.repeat(column % this.tabSize)
        : ' '.repeat(column);

    const rest = edits.filter((e) => !inside.includes(e));
    if (indent !== text.slice(ls, le)) rest.push({ start: ls, end: le, newText: indent });
    return rest;
  }

  /** pos 之前到行首是否只有空白（即编辑修改的是缩进）。 */
  private isIndentation(pos: number): boolean {
    for (let i = pos - 1; i >= 0 && this.text[i] !== '\n'; i--) {
      if (this.text[i] !== ' ' && this.text[i] !== '\t') return false;
    }
    return true;
  }

  private inRange(pos: number): boolean {
    return !this.range || (pos >= this.range.start && pos <= this.range.end);
  }
}

function columnOf(ws: string, tabSize: number): number {
  let col = 0;
  for (const ch of ws) col = ch === '\t' ? col - (col % tabSize) + tabSize : col + 1;
  return col;
}

/** 把编辑应用到文本上（测试与预览用）。 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
}
