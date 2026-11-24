import * as vscode from 'vscode';
import { ArkColorProvider } from './features/colors';
import { ArkCompletionProvider } from './features/completion';
import { ARKTS_SELECTOR, DocumentCache } from './features/documents';
import { ArkFormattingProvider } from './features/formatting';
import { ArkHoverProvider } from './features/hover';
import { ResourceIndex } from './features/resourceIndex';
import {
  ResourceCompletionProvider,
  ResourceDefinitionProvider,
  ResourceDiagnostics,
  ResourceHoverProvider,
} from './features/resources';
import { ArkSymbolProvider } from './features/symbols';

export function activate(context: vscode.ExtensionContext): void {
  const cache = new DocumentCache();
  const index = new ResourceIndex();
  const formatter = new ArkFormattingProvider();
  const l = vscode.languages;

  context.subscriptions.push(
    cache,
    index,
    l.registerDocumentSymbolProvider(ARKTS_SELECTOR, new ArkSymbolProvider(cache), { label: 'ArkTS' }),
    l.registerCompletionItemProvider(ARKTS_SELECTOR, new ArkCompletionProvider(cache), '@'),
    l.registerCompletionItemProvider(ARKTS_SELECTOR, new ResourceCompletionProvider(index), "'", '"', '`', '.', '/'),
    l.registerHoverProvider(ARKTS_SELECTOR, new ArkHoverProvider()),
    l.registerHoverProvider(ARKTS_SELECTOR, new ResourceHoverProvider(cache, index)),
    l.registerDefinitionProvider(ARKTS_SELECTOR, new ResourceDefinitionProvider(cache, index)),
    l.registerColorProvider(ARKTS_SELECTOR, new ArkColorProvider(cache, index)),
    new ResourceDiagnostics(cache, index),
  );

  const registerFormatter = () => {
    if (!vscode.workspace.getConfiguration('arkts').get<boolean>('format.enable', true)) return undefined;
    return vscode.Disposable.from(
      l.registerDocumentFormattingEditProvider(ARKTS_SELECTOR, formatter),
      l.registerDocumentRangeFormattingEditProvider(ARKTS_SELECTOR, formatter),
    );
  };
  let formatting = registerFormatter();
  context.subscriptions.push(
    { dispose: () => formatting?.dispose() },
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('arkts.format.enable')) return;
      formatting?.dispose();
      formatting = registerFormatter();
    }),
    vscode.commands.registerCommand('arkts.refreshResources', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'ArkTS: 正在索引资源…' },
        () => index.refresh(),
      );
      const count = index.allItems().length + index.allRawfiles().length;
      void vscode.window.showInformationMessage(`ArkTS: 已索引 ${count} 个资源`);
    }),
  );

  void index.ready();
}

export function deactivate(): void {}
