import * as vscode from 'vscode';
import { ArkSymbol, ArkSymbolKind, documentSymbols } from '../core/symbols';
import { DocumentCache, toRange } from './documents';

const KIND: Record<ArkSymbolKind, vscode.SymbolKind> = {
  struct: vscode.SymbolKind.Struct,
  class: vscode.SymbolKind.Class,
  interface: vscode.SymbolKind.Interface,
  enum: vscode.SymbolKind.Enum,
  enumMember: vscode.SymbolKind.EnumMember,
  function: vscode.SymbolKind.Function,
  method: vscode.SymbolKind.Method,
  constructor: vscode.SymbolKind.Constructor,
  property: vscode.SymbolKind.Property,
  getter: vscode.SymbolKind.Property,
  setter: vscode.SymbolKind.Property,
  variable: vscode.SymbolKind.Variable,
  constant: vscode.SymbolKind.Constant,
  namespace: vscode.SymbolKind.Namespace,
  type: vscode.SymbolKind.TypeParameter,
  component: vscode.SymbolKind.Object,
  renderingControl: vscode.SymbolKind.Operator,
  condition: vscode.SymbolKind.Boolean,
  builderCall: vscode.SymbolKind.Function,
};

export class ArkSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly cache: DocumentCache) {}

  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const showTree = vscode.workspace.getConfiguration('arkts', document).get<boolean>('outline.showComponentTree', true);
    const convert = (s: ArkSymbol): vscode.DocumentSymbol | undefined => {
      const isUi = s.kind === 'component' || s.kind === 'renderingControl' || s.kind === 'condition' || s.kind === 'builderCall';
      if (isUi && !showTree) return undefined;
      const range = toRange(document, s.start, s.end);
      const selection = toRange(document, s.selectionStart, s.selectionEnd);
      const symbol = new vscode.DocumentSymbol(s.name || '<anonymous>', s.detail, KIND[s.kind], range, range.contains(selection) ? selection : range);
      symbol.children = s.children.map(convert).filter((c): c is vscode.DocumentSymbol => c !== undefined);
      return symbol;
    };
    return documentSymbols(this.cache.get(document))
      .map(convert)
      .filter((c): c is vscode.DocumentSymbol => c !== undefined);
  }
}
