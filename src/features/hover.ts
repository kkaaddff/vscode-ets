import * as vscode from 'vscode';
import { componentByName, decoratorByName, renderingControlByName } from '../core/data';
import { componentMarkdown, decoratorMarkdown, renderingControlMarkdown } from './markdown';

/** 装饰器、内置组件和渲染控制语法的悬停文档。 */
export class ArkHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, /[_$A-Za-z][_$\w]*/);
    if (!range) return undefined;
    const word = document.getText(range);
    const line = document.lineAt(position.line).text;
    const before = line.slice(0, range.start.character);
    const after = line.slice(range.end.character);

    if (before.endsWith('@')) {
      const d = decoratorByName.get(word);
      return d && new vscode.Hover(decoratorMarkdown(d), range);
    }
    // 只在调用位置提示，避免与同名的普通标识符冲突
    if (/^\s*[(<]/.test(after) && !/[.\w$]$/.test(before)) {
      const c = componentByName.get(word);
      if (c) return new vscode.Hover(componentMarkdown(c), range);
      const r = renderingControlByName.get(word);
      if (r) return new vscode.Hover(renderingControlMarkdown(r), range);
    }
    // @Extend(Text) 中的组件名
    const component = componentByName.get(word);
    if (component && /@(?:Animatable)?Extend\s*\(\s*$/.test(before)) return new vscode.Hover(componentMarkdown(component), range);
    return undefined;
  }
}
