import type * as TS from 'typescript';
import * as vscode from 'vscode';
import { COMPONENTS, ComponentInfo, DECORATORS, DecoratorInfo, RENDERING_CONTROLS } from '../core/data';
import { ts } from '../core/source';
import { DocumentCache } from './documents';
import { componentMarkdown, decoratorMarkdown, renderingControlMarkdown } from './markdown';

/** 在 struct/class 内部也可以使用的全局装饰器。 */
const MEMBER_ALSO = new Set(['Builder', 'Styles']);

const RENDERING_SNIPPETS: Record<string, string> = {
  ForEach: 'ForEach(${1:this.items}, (${2:item}: ${3:string}, ${4:index}: number) => {\n\t$0\n}, (${2:item}: ${3:string}) => ${5:${2:item}})',
  LazyForEach: 'LazyForEach(${1:this.dataSource}, (${2:item}: ${3:string}) => {\n\t$0\n}, (${2:item}: ${3:string}) => ${4:${2:item}})',
  Repeat: 'Repeat<${1:string}>(${2:this.items})\n\t.each((${3:obj}: RepeatItem<${1:string}>) => {\n\t\t$0\n\t})\n\t.key((${4:item}: ${1:string}) => ${5:${4:item}})',
};

/** 这些组件虽然名义上可以有子组件，但通常不写尾随闭包。 */
const NO_CLOSURE = new Set(['Toggle']);

const hasChildren = (c: ComponentInfo) => c.children !== '无' && !NO_CLOSURE.has(c.name);

type DecoratorContext = 'top' | 'member' | 'unknown';

export class ArkCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly cache: DocumentCache) {}

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    if (isInLineComment(linePrefix)) return undefined;

    const decorator = /@([_$A-Za-z][_$\w]*)?$/.exec(linePrefix);
    if (decorator) {
      const context = this.decoratorContext(document, document.offsetAt(position));
      const range = new vscode.Range(position.translate(0, -(decorator[1]?.length ?? 0)), position);
      return DECORATORS.filter((d) => matchesContext(d, context)).map((d) => decoratorItem(d, range));
    }

    const statement = /^\s*([A-Z][_$\w]*)$/.exec(linePrefix);
    if (statement && vscode.workspace.getConfiguration('arkts', document).get<boolean>('completion.components', true)) {
      const range = new vscode.Range(position.translate(0, -statement[1].length), position);
      return [
        ...COMPONENTS.map((c) => componentItem(c, range)),
        ...RENDERING_CONTROLS.map((c) => {
          const item = new vscode.CompletionItem({ label: c.name, description: '渲染控制' }, vscode.CompletionItemKind.Keyword);
          item.insertText = new vscode.SnippetString(RENDERING_SNIPPETS[c.name] ?? `${c.name}($1)`);
          item.documentation = renderingControlMarkdown(c);
          item.range = range;
          return item;
        }),
      ];
    }
    return undefined;
  }

  /** 光标在 struct/class 成员位置还是顶层。 */
  private decoratorContext(document: vscode.TextDocument, offset: number): DecoratorContext {
    const t = ts();
    const { source, sourceFile: sf } = this.cache.get(document);
    const pos = source.toGenerated(offset);
    let context: DecoratorContext = 'top';
    const visit = (node: TS.Node): void => {
      if (pos <= node.getFullStart() || pos > node.getEnd()) return;
      if (t.isClassLike(node)) {
        const open = node.members.pos;
        context = pos > open && pos < node.getEnd() ? 'member' : context;
      } else if (t.isFunctionLike(node) && 'body' in node && node.body && pos > (node.body as TS.Node).getStart(sf)) {
        context = 'unknown';
        return;
      }
      t.forEachChild(node, visit);
    };
    visit(sf);
    return context;
  }
}

function matchesContext(d: DecoratorInfo, context: DecoratorContext): boolean {
  if (context === 'unknown') return true;
  const member = d.target === 'member' || d.target === 'method';
  return context === 'member' ? member || MEMBER_ALSO.has(d.name) : !member;
}

function decoratorItem(d: DecoratorInfo, range: vscode.Range): vscode.CompletionItem {
  const item = new vscode.CompletionItem({ label: d.name, description: d.group }, vscode.CompletionItemKind.Keyword);
  item.insertText = new vscode.SnippetString(d.snippet);
  item.documentation = decoratorMarkdown(d);
  item.range = range;
  item.sortText = `0_${d.name}`;
  return item;
}

function componentItem(c: ComponentInfo, range: vscode.Range): vscode.CompletionItem {
  const item = new vscode.CompletionItem({ label: c.name, description: '内置组件' }, vscode.CompletionItemKind.Class);
  item.insertText = new vscode.SnippetString(hasChildren(c) ? `${c.name}($1) {\n\t$0\n}` : `${c.name}($0)`);
  item.documentation = componentMarkdown(c);
  item.range = range;
  return item;
}

function isInLineComment(linePrefix: string): boolean {
  const idx = linePrefix.indexOf('//');
  return idx >= 0 && !/['"`]/.test(linePrefix.slice(0, idx));
}
