import * as vscode from 'vscode';
import { parseArkTS, ParsedArkTS } from '../core/source';

export const LANGUAGE_ID = 'arkts';
export const ARKTS_SELECTOR: vscode.DocumentSelector = [
  { language: LANGUAGE_ID, scheme: 'file' },
  { language: LANGUAGE_ID, scheme: 'untitled' },
  { language: LANGUAGE_ID, scheme: 'vscode-vfs' },
];

interface CacheEntry {
  version: number;
  parsed: ParsedArkTS;
}

/** 按文档版本缓存语法树：大纲、颜色、诊断等功能共享同一次解析。 */
export class DocumentCache implements vscode.Disposable {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly subscription = vscode.workspace.onDidCloseTextDocument((doc) =>
    this.entries.delete(doc.uri.toString()),
  );

  get(document: vscode.TextDocument): ParsedArkTS {
    const key = document.uri.toString();
    const cached = this.entries.get(key);
    if (cached && cached.version === document.version) return cached.parsed;
    const parsed = parseArkTS(document.getText(), document.fileName);
    this.entries.set(key, { version: document.version, parsed });
    return parsed;
  }

  dispose(): void {
    this.subscription.dispose();
    this.entries.clear();
  }
}

export function toRange(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}
