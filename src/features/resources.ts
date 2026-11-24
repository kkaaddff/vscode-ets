import * as vscode from 'vscode';
import { parseArkColor } from '../core/colors';
import { RESOURCE_DOC } from '../core/data';
import {
  findResourceRefs,
  parseRef,
  RESOURCE_TYPES,
  ResourceRef,
  resourceCompletionContext,
  ResourceType,
} from '../core/resources';
import { DocumentCache, LANGUAGE_ID, toRange } from './documents';
import { ResourceIndex, ResourceItem } from './resourceIndex';

const TYPE_SET = new Set<string>(RESOURCE_TYPES);

const ITEM_KIND: Partial<Record<ResourceType, vscode.CompletionItemKind>> = {
  string: vscode.CompletionItemKind.Text,
  color: vscode.CompletionItemKind.Color,
  float: vscode.CompletionItemKind.Value,
  integer: vscode.CompletionItemKind.Value,
  boolean: vscode.CompletionItemKind.Value,
  media: vscode.CompletionItemKind.File,
  profile: vscode.CompletionItemKind.File,
};

/** 把 ArkTS 颜色转成 VS Code 补全能识别的 CSS 颜色，以显示色块。 */
function cssColor(value: string): string | undefined {
  const c = parseArkColor(value);
  if (!c) return undefined;
  const b = (v: number) => Math.round(v * 255);
  return `rgba(${b(c.red)}, ${b(c.green)}, ${b(c.blue)}, ${Number(c.alpha.toFixed(3))})`;
}

function qualifierLabel(item: ResourceItem): string {
  return item.qualifier === 'base' ? 'base' : `\`${item.qualifier}\``;
}

export class ResourceCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: ResourceIndex) {}

  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const context = resourceCompletionContext(linePrefix);
    if (!context) return undefined;
    await this.index.ready();

    const lineSuffix = document.lineAt(position.line).text.slice(position.character);
    const tail = /^[^'"`)\s]*/.exec(lineSuffix)?.[0].length ?? 0;
    const range = new vscode.Range(position.translate(0, -context.prefix.length), position.translate(0, tail));

    if (context.kind === 'rawfile') {
      return this.index.allRawfiles().map((f) => {
        const item = new vscode.CompletionItem(f.path, vscode.CompletionItemKind.File);
        item.range = range;
        item.detail = vscode.workspace.asRelativePath(f.uri);
        return item;
      });
    }

    return this.index.allItems().map((r) => {
      const label = `app.${r.type}.${r.name}`;
      const item = new vscode.CompletionItem({ label, description: r.value }, ITEM_KIND[r.type] ?? vscode.CompletionItemKind.Reference);
      item.range = range;
      item.filterText = label;
      if (r.type === 'color') {
        const resolved = this.index.resolveColor(r.name);
        const css = resolved && cssColor(resolved);
        if (css) item.documentation = css;
      } else {
        item.documentation = new vscode.MarkdownString().appendText(r.value);
      }
      return item;
    });
  }
}

/** 光标所在的资源引用。 */
function refAt(cache: DocumentCache, document: vscode.TextDocument, position: vscode.Position): ResourceRef | undefined {
  const offset = document.offsetAt(position);
  return findResourceRefs(cache.get(document)).find((r) => offset >= r.start && offset <= r.end);
}

export class ResourceHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly cache: DocumentCache,
    private readonly index: ResourceIndex,
  ) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const ref = refAt(this.cache, document, position);
    if (!ref) return undefined;
    await this.index.ready();
    const range = toRange(document, ref.start, ref.end);
    const md = new vscode.MarkdownString();

    if (ref.kind === 'rawfile') {
      const file = this.index.rawfile(ref.value);
      if (!file) return undefined;
      md.appendMarkdown(`**rawfile** · [${vscode.workspace.asRelativePath(file.uri)}](${file.uri})`);
      if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.path)) md.appendMarkdown(`\n\n![](${file.uri}|height=96)`);
      return new vscode.Hover(md, range);
    }

    const parsed = parseRef(ref.value);
    if (!parsed || parsed.scope !== 'app') return undefined;
    const items = this.index.lookup(parsed.type, parsed.name);
    if (items.length === 0) return undefined;

    md.appendMarkdown(`**${parsed.type}** · \`${parsed.name}\`\n\n`);
    if (parsed.type === 'media') {
      for (const item of items) {
        md.appendMarkdown(`- ${qualifierLabel(item)}: [${item.value}](${item.uri})\n`);
      }
      const image = items.find((i) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(i.value));
      if (image) md.appendMarkdown(`\n![](${image.uri}|height=96)`);
    } else {
      md.appendMarkdown('| 限定词 | 值 |\n| --- | --- |\n');
      for (const item of items) {
        const value = item.value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        md.appendMarkdown(`| ${qualifierLabel(item)} | ${value || '*(空)*'} |\n`);
      }
    }
    md.appendMarkdown(`\n[资源文档](${RESOURCE_DOC})`);
    return new vscode.Hover(md, range);
  }
}

export class ResourceDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly cache: DocumentCache,
    private readonly index: ResourceIndex,
  ) {}

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.DefinitionLink[] | undefined> {
    const ref = refAt(this.cache, document, position);
    if (!ref) return undefined;
    await this.index.ready();
    const origin = toRange(document, ref.start, ref.end);

    if (ref.kind === 'rawfile') {
      const file = this.index.rawfile(ref.value);
      return file && [{ originSelectionRange: origin, targetUri: file.uri, targetRange: new vscode.Range(0, 0, 0, 0) }];
    }
    const parsed = parseRef(ref.value);
    if (!parsed || parsed.scope !== 'app') return undefined;
    const links: vscode.DefinitionLink[] = [];
    for (const item of this.index.lookup(parsed.type, parsed.name)) {
      let targetRange = new vscode.Range(0, 0, 0, 0);
      if (item.nameRange) {
        const target = await vscode.workspace.openTextDocument(item.uri);
        targetRange = toRange(target, item.nameRange.start, item.nameRange.end);
      }
      links.push({ originSelectionRange: origin, targetUri: item.uri, targetRange });
    }
    return links;
  }
}

/** 检查 `$r()` / `$rawfile()` 引用的资源是否存在。 */
export class ResourceDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('arkts-resources');
  private readonly disposables: vscode.Disposable[] = [this.collection];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly cache: DocumentCache,
    private readonly index: ResourceIndex,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.schedule(d, 0)),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document, 400)),
      vscode.workspace.onDidCloseTextDocument((d) => {
        this.collection.delete(d.uri);
        clearTimeout(this.timers.get(d.uri.toString()));
        this.timers.delete(d.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('arkts.diagnostics') && this.refreshAll()),
      index.onDidChange(() => this.refreshAll()),
    );
    void index.ready().then(() => this.refreshAll());
  }

  private refreshAll(): void {
    for (const doc of vscode.workspace.textDocuments) this.schedule(doc, 0);
  }

  private schedule(document: vscode.TextDocument, delay: number): void {
    if (document.languageId !== LANGUAGE_ID) return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (!document.isClosed) this.collection.set(document.uri, this.check(document));
      }, delay),
    );
  }

  private check(document: vscode.TextDocument): vscode.Diagnostic[] {
    const enabled = vscode.workspace.getConfiguration('arkts', document).get<boolean>('diagnostics.resources', true);
    // 工作区中没有任何资源目录时（例如只打开了单个文件）不做检查，避免误报
    if (!enabled || this.index.isEmpty) return [];

    const diagnostics: vscode.Diagnostic[] = [];
    const report = (ref: ResourceRef, message: string) => {
      const d = new vscode.Diagnostic(toRange(document, ref.start, ref.end), message, vscode.DiagnosticSeverity.Warning);
      d.source = 'arkts';
      d.code = { value: 'resource', target: vscode.Uri.parse(RESOURCE_DOC) };
      diagnostics.push(d);
    };

    for (const ref of findResourceRefs(this.cache.get(document))) {
      if (ref.kind === 'rawfile') {
        if (this.index.hasRawfiles && !this.index.rawfile(ref.value)) report(ref, `找不到 rawfile 资源 "${ref.value}"`);
        continue;
      }
      const parsed = parseRef(ref.value);
      if (!parsed) {
        report(ref, `资源引用格式应为 "app.<类型>.<名称>"，例如 "app.string.app_name"`);
      } else if (parsed.scope === 'app') {
        if (!TYPE_SET.has(parsed.type)) {
          report(ref, `未知的资源类型 "${parsed.type}"，可选：${RESOURCE_TYPES.join(', ')}`);
        } else if (this.index.lookup(parsed.type, parsed.name).length === 0) {
          report(ref, `找不到资源 "${ref.value}"`);
        }
      }
    }
    return diagnostics;
  }

  dispose(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.disposables.forEach((d) => d.dispose());
  }
}
