import type * as TS from 'typescript';
import { renderingControlByName } from './data';
import { isAttributeChainStatement, ParsedArkTS, ts } from './source';

export type ArkSymbolKind =
  | 'struct'
  | 'class'
  | 'interface'
  | 'enum'
  | 'enumMember'
  | 'function'
  | 'method'
  | 'constructor'
  | 'property'
  | 'getter'
  | 'setter'
  | 'variable'
  | 'constant'
  | 'namespace'
  | 'type'
  | 'component'
  | 'renderingControl'
  | 'condition'
  | 'builderCall';

/** 与编辑器无关的大纲符号，偏移均为原始文本偏移。 */
export interface ArkSymbol {
  name: string;
  detail: string;
  kind: ArkSymbolKind;
  start: number;
  end: number;
  selectionStart: number;
  selectionEnd: number;
  children: ArkSymbol[];
}

/** 这些方法/函数的函数体是 UI 描述，在大纲中展开为组件树。 */
const UI_BUILDER_DECORATORS = new Set(['Builder', 'LocalBuilder']);
const MAX_DETAIL = 40;

export function documentSymbols({ source, sourceFile: sf }: ParsedArkTS): ArkSymbol[] {
  const t = ts();
  const K = t.SyntaxKind;

  const make = (
    name: string,
    kind: ArkSymbolKind,
    node: TS.Node,
    nameNode: TS.Node | undefined,
    detail = '',
    children: ArkSymbol[] = [],
    end = node.getEnd(),
  ): ArkSymbol => {
    const start = node.getStart(sf);
    const selStart = nameNode ? nameNode.getStart(sf) : start;
    const selEnd = nameNode ? nameNode.getEnd() : start;
    return {
      name: name || '<anonymous>',
      detail,
      kind,
      start: source.toOriginal(start),
      end: source.toOriginal(end),
      selectionStart: source.toOriginal(selStart),
      selectionEnd: source.toOriginal(selEnd),
      children,
    };
  };

  const decoratorsOf = (node: TS.Node): TS.Decorator[] => {
    const modifiers = (node as { modifiers?: TS.NodeArray<TS.ModifierLike> }).modifiers;
    return modifiers ? modifiers.filter(t.isDecorator) : [];
  };
  const decoratorName = (d: TS.Decorator): string => {
    const callee = t.isCallExpression(d.expression) ? d.expression.expression : d.expression;
    return callee.getText(sf);
  };
  const decoratorDetail = (node: TS.Node): string =>
    decoratorsOf(node).map((d) => `@${oneLine(d.expression.getText(sf))}`).join(' ');
  const isUiBuilder = (node: TS.Node): boolean =>
    decoratorsOf(node).some((d) => UI_BUILDER_DECORATORS.has(decoratorName(d)));
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  const typeText = (type: TS.TypeNode | undefined) => (type ? truncate(oneLine(type.getText(sf))) : '');
  const nameOf = (name: TS.Node | undefined): string => {
    if (!name) return '';
    if (t.isIdentifier(name) || t.isPrivateIdentifier(name) || t.isStringLiteral(name) || t.isNumericLiteral(name)) {
      return name.text;
    }
    return oneLine(name.getText(sf));
  };

  function visitStatements(statements: readonly TS.Statement[]): ArkSymbol[] {
    const out: ArkSymbol[] = [];
    for (const st of statements) {
      if (t.isClassDeclaration(st)) out.push(classSymbol(st));
      else if (t.isInterfaceDeclaration(st)) out.push(interfaceSymbol(st));
      else if (t.isEnumDeclaration(st)) {
        const members = st.members.map((m) => make(nameOf(m.name), 'enumMember', m, m.name));
        out.push(make(st.name.text, 'enum', st, st.name, '', members));
      } else if (t.isFunctionDeclaration(st)) {
        const children = isUiBuilder(st) && st.body ? uiTree(st.body.statements) : [];
        out.push(make(nameOf(st.name), 'function', st, st.name, decoratorDetail(st), children));
      } else if (t.isTypeAliasDeclaration(st)) {
        out.push(make(st.name.text, 'type', st, st.name));
      } else if (t.isModuleDeclaration(st)) {
        let body = st.body;
        while (body && t.isModuleDeclaration(body)) body = body.body;
        const children = body && t.isModuleBlock(body) ? visitStatements(body.statements) : [];
        out.push(make(nameOf(st.name), 'namespace', st, st.name, '', children));
      } else if (t.isVariableStatement(st)) {
        const isConst = (st.declarationList.flags & t.NodeFlags.Const) !== 0;
        for (const decl of st.declarationList.declarations) {
          out.push(make(nameOf(decl.name), isConst ? 'constant' : 'variable', decl, decl.name, typeText(decl.type)));
        }
      }
    }
    return out;
  }

  function classSymbol(node: TS.ClassDeclaration): ArkSymbol {
    const keyword = node.getChildren(sf).find((c) => c.kind === K.ClassKeyword);
    const isStruct = keyword !== undefined && source.isStructKeyword(keyword.getStart(sf));
    const members: ArkSymbol[] = [];
    for (const m of node.members) {
      if (t.isPropertyDeclaration(m)) {
        members.push(make(nameOf(m.name), 'property', m, m.name, join(decoratorDetail(m), typeText(m.type))));
      } else if (t.isMethodDeclaration(m)) {
        const name = nameOf(m.name);
        const ui = m.body && ((isStruct && name === 'build') || isUiBuilder(m));
        members.push(make(name, 'method', m, m.name, decoratorDetail(m), ui ? uiTree(m.body!.statements) : []));
      } else if (t.isConstructorDeclaration(m)) {
        members.push(make('constructor', 'constructor', m, m.getFirstToken(sf)));
      } else if (t.isGetAccessorDeclaration(m)) {
        members.push(make(nameOf(m.name), 'getter', m, m.name, join(decoratorDetail(m), typeText(m.type))));
      } else if (t.isSetAccessorDeclaration(m)) {
        members.push(make(nameOf(m.name), 'setter', m, m.name, decoratorDetail(m)));
      }
    }
    return make(nameOf(node.name) || 'default', isStruct ? 'struct' : 'class', node, node.name, decoratorDetail(node), members);
  }

  function interfaceSymbol(node: TS.InterfaceDeclaration): ArkSymbol {
    const members: ArkSymbol[] = [];
    for (const m of node.members) {
      if (t.isPropertySignature(m)) members.push(make(nameOf(m.name), 'property', m, m.name, typeText(m.type)));
      else if (t.isMethodSignature(m)) members.push(make(nameOf(m.name), 'method', m, m.name));
    }
    return make(node.name.text, 'interface', node, node.name, '', members);
  }

  // ------------------------------------------------------------------ UI 组件树

  interface UiCall {
    name: string;
    nameNode: TS.Node;
    call: TS.CallExpression;
    /** 渲染控制（ForEach / Repeat ...）中生成子组件的回调。 */
    callbacks: TS.Block[];
  }

  /**
   * 识别 `Column(...).width(...)`、`this.myBuilder()`、`ForEach(...)`、`Repeat(...).each(...)`
   * 这类 UI 语句，返回最左侧的那次调用。
   */
  function uiCall(expr: TS.Expression): UiCall | undefined {
    const chain: TS.CallExpression[] = [];
    let e: TS.Expression = expr;
    for (;;) {
      if (t.isCallExpression(e)) {
        chain.push(e);
        const callee = e.expression;
        if (t.isIdentifier(callee)) {
          if (!callee.text) return undefined; // `}.width(100)`：尾随闭包后的属性链
          return finish(callee.text, callee, e);
        }
        if (t.isPropertyAccessExpression(callee) && callee.expression.kind === K.ThisKeyword) {
          return finish(`this.${callee.name.text}`, callee.name, e);
        }
        if (t.isPropertyAccessExpression(callee)) {
          e = callee.expression;
          continue;
        }
        return undefined;
      }
      if (t.isPropertyAccessExpression(e) || t.isNonNullExpression(e) || t.isParenthesizedExpression(e)) {
        e = e.expression;
        continue;
      }
      return undefined;
    }

    function finish(name: string, nameNode: TS.Node, call: TS.CallExpression): UiCall {
      const callbacks: TS.Block[] = [];
      if (renderingControlByName.has(name)) {
        for (const c of chain) {
          for (const arg of c.arguments) {
            if ((t.isArrowFunction(arg) || t.isFunctionExpression(arg)) && t.isBlock(arg.body)) {
              callbacks.push(arg.body);
            }
          }
        }
      }
      return { name, nameNode, call, callbacks };
    }
  }

  function uiKind(name: string): ArkSymbolKind {
    if (renderingControlByName.has(name)) return 'renderingControl';
    if (/^[A-Z]/.test(name)) return 'component';
    return 'builderCall';
  }

  function uiDetail(call: TS.CallExpression): string {
    const first = call.arguments[0];
    if (!first || t.isArrowFunction(first) || t.isFunctionExpression(first)) return '';
    return truncate(oneLine(first.getText(sf)));
  }

  const isAttributeChain = (st: TS.Statement | undefined): st is TS.ExpressionStatement =>
    st !== undefined && isAttributeChainStatement(st, sf);

  function uiTree(statements: readonly TS.Statement[]): ArkSymbol[] {
    const out: ArkSymbol[] = [];
    for (let i = 0; i < statements.length; i++) {
      const st = statements[i];
      if (isAttributeChain(st)) continue;
      if (t.isExpressionStatement(st)) {
        const info = uiCall(st.expression);
        if (!info) continue;
        const children = info.callbacks.flatMap((b) => uiTree(b.statements));
        let end = st.getEnd();
        // 尾随闭包：`Column() { ... }` 被 TS 解析为表达式语句 + 紧随其后的块语句
        const next = statements[i + 1];
        if (next && t.isBlock(next) && !st.getText(sf).endsWith(';')) {
          children.push(...uiTree(next.statements));
          end = next.getEnd();
          i++;
          while (isAttributeChain(statements[i + 1])) end = statements[++i].getEnd();
        }
        out.push(make(info.name, uiKind(info.name), st, info.nameNode, uiDetail(info.call), children, end));
      } else if (t.isIfStatement(st)) {
        out.push(...ifSymbols(st, 'if'));
      } else if (t.isBlock(st)) {
        out.push(...uiTree(st.statements));
      }
    }
    return out;
  }

  function ifSymbols(node: TS.IfStatement, label: string): ArkSymbol[] {
    const condition = truncate(oneLine(node.expression.getText(sf)));
    const thenEnd = node.thenStatement.getEnd();
    const result = [
      make(`${label} (${condition})`, 'condition', node, node.getFirstToken(sf), '', blockChildren(node.thenStatement), thenEnd),
    ];
    const elseNode = node.elseStatement;
    if (elseNode) {
      if (t.isIfStatement(elseNode)) {
        result.push(...ifSymbols(elseNode, 'else if'));
      } else {
        result.push(make('else', 'condition', elseNode, undefined, '', blockChildren(elseNode)));
      }
    }
    return result;
  }

  function blockChildren(st: TS.Statement): ArkSymbol[] {
    return uiTree(t.isBlock(st) ? st.statements : [st]);
  }

  return visitStatements(sf.statements);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text;
}
