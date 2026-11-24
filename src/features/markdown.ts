import * as vscode from 'vscode';
import { ComponentInfo, DecoratorInfo, docUrl, RenderingControlInfo } from '../core/data';

export function decoratorMarkdown(d: DecoratorInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(`@${d.name}`, 'arkts');
  md.appendMarkdown(`**${d.group}** · ${d.summary}\n\n`);
  if (d.detail) md.appendMarkdown(`${d.detail}\n\n`);
  md.appendMarkdown(`[官方文档](${docUrl(d.doc)})`);
  return md;
}

export function componentMarkdown(c: ComponentInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(`${c.name}()`, 'arkts');
  md.appendMarkdown(`**内置组件** · ${c.summary}\n\n子组件：${c.children}\n\n[官方文档](${docUrl(c.doc)})`);
  return md;
}

export function renderingControlMarkdown(c: RenderingControlInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(`${c.name}${c.signature}`, 'arkts');
  md.appendMarkdown(`**渲染控制** · ${c.summary}\n\n[官方文档](${docUrl(c.doc)})`);
  return md;
}
