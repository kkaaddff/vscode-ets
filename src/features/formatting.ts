import type * as TS from 'typescript';
import * as vscode from 'vscode';
import { formatArkTS } from '../core/format';
import { ts } from '../core/source';
import { toRange } from './documents';

type Semicolons = 'ignore' | 'insert' | 'remove';

function formatSettings(document: vscode.TextDocument, options: vscode.FormattingOptions): TS.FormatCodeSettings {
  const config = vscode.workspace.getConfiguration('arkts.format', document);
  const semicolons = config.get<Semicolons>('semicolons', 'ignore');
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  return {
    indentSize: options.tabSize,
    tabSize: options.tabSize,
    convertTabsToSpaces: options.insertSpaces,
    newLineCharacter: eol,
    indentStyle: ts().IndentStyle.Smart,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterSemicolonInForStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
    insertSpaceAfterKeywordsInControlFlowStatements: true,
    insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: config.get<boolean>('insertSpaceInEmptyBraces', false),
    insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
    insertSpaceAfterTypeAssertion: false,
    insertSpaceBeforeFunctionParenthesis: false,
    placeOpenBraceOnNewLineForFunctions: false,
    placeOpenBraceOnNewLineForControlBlocks: false,
    semicolons: semicolons as TS.SemicolonPreference,
  };
}

export class ArkFormattingProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[] {
    return this.format(document, options);
  }

  provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
  ): vscode.TextEdit[] {
    return this.format(document, options, { start: document.offsetAt(range.start), end: document.offsetAt(range.end) });
  }

  private format(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    range?: { start: number; end: number },
  ): vscode.TextEdit[] {
    const edits = formatArkTS(document.getText(), formatSettings(document, options), range);
    return edits.map((e) => vscode.TextEdit.replace(toRange(document, e.start, e.end), e.newText));
  }
}
