import { parseTree, type Node as JsonNode } from 'jsonc-parser';
import type * as TS from 'typescript';
import { ParsedArkTS, ts } from './source';

/** resources/<限定词>/element/*.json 中支持的资源类型。 */
export const ELEMENT_TYPES = [
  'string', 'color', 'float', 'integer', 'boolean', 'plural', 'strarray', 'intarray', 'pattern', 'theme',
] as const;

/** 可以通过 `$r('app.<type>.<name>')` 引用的全部资源类型。 */
export const RESOURCE_TYPES = [...ELEMENT_TYPES, 'media', 'profile'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface ElementEntry {
  type: ResourceType;
  name: string;
  /** 简单值（string/color/float/...）的文本形式；数组、复合值为 JSON 片段。 */
  value: string;
  /** name 字符串值在文件中的偏移（含引号）。 */
  nameStart: number;
  nameEnd: number;
}

const ELEMENT_TYPE_SET = new Set<string>(ELEMENT_TYPES);

/**
 * 解析 element 目录下的资源文件，例如：
 * `{ "string": [{ "name": "app_name", "value": "Demo" }] }`
 */
export function parseElementFile(text: string): ElementEntry[] {
  const root = parseTree(text, [], { allowTrailingComma: true });
  if (!root || root.type !== 'object') return [];
  const entries: ElementEntry[] = [];
  for (const prop of root.children ?? []) {
    const [key, list] = prop.children ?? [];
    if (!key || !list || !ELEMENT_TYPE_SET.has(key.value) || list.type !== 'array') continue;
    for (const item of list.children ?? []) {
      if (item.type !== 'object') continue;
      const name = property(item, 'name');
      if (!name || name.type !== 'string') continue;
      const value = property(item, 'value');
      entries.push({
        type: key.value as ResourceType,
        name: name.value,
        value: value ? jsonText(text, value) : '',
        nameStart: name.offset,
        nameEnd: name.offset + name.length,
      });
    }
  }
  return entries;
}

function property(obj: JsonNode, name: string): JsonNode | undefined {
  const prop = obj.children?.find((p) => p.children?.[0]?.value === name);
  return prop?.children?.[1];
}

function jsonText(text: string, node: JsonNode): string {
  if (node.type === 'string' || node.type === 'number' || node.type === 'boolean') return String(node.value);
  return text.slice(node.offset, node.offset + node.length).replace(/\s+/g, ' ');
}

/** 资源文件路径中的关键信息。 */
export type ResourceFileInfo =
  | { kind: 'element'; qualifier: string }
  | { kind: 'media' | 'profile'; qualifier: string; name: string }
  | { kind: 'rawfile'; path: string };

/**
 * 根据路径判断资源文件类型，路径分隔符统一为 `/`。
 * 例如 `entry/src/main/resources/base/media/icon.png` → media `icon`。
 */
export function classifyResourcePath(path: string): ResourceFileInfo | undefined {
  const p = path.replace(/\\/g, '/');
  const raw = /\/resources\/rawfile\/(.+)$/.exec(p);
  if (raw) return { kind: 'rawfile', path: raw[1] };
  const m = /\/resources\/([^/]+)\/(element|media|profile)\/([^/]+)$/.exec(p);
  if (!m) return undefined;
  const [, qualifier, dir, file] = m;
  if (qualifier === 'rawfile') return undefined;
  if (dir === 'element') return file.endsWith('.json') ? { kind: 'element', qualifier } : undefined;
  const name = file.replace(/\.[^.]*$/, '');
  return { kind: dir as 'media' | 'profile', qualifier, name };
}

export type RefKind = 'r' | 'rawfile';

export interface ResourceRef {
  kind: RefKind;
  /** 字符串内容，例如 `app.string.ok`。 */
  value: string;
  /** 字符串内容（不含引号）在原文中的区间。 */
  start: number;
  end: number;
  /** 整个 `$r(...)` 调用在原文中的区间。 */
  callStart: number;
  callEnd: number;
}

/** 解析后的资源引用：`app.string.ok` → { scope: 'app', type: 'string', name: 'ok' }。 */
export interface ParsedRef {
  scope: string;
  type: string;
  name: string;
}

const REF_PATTERN = /^(app|sys|\[[^\]]+\])\.([a-z]+)\.(.+)$/;

export function parseRef(value: string): ParsedRef | undefined {
  const m = REF_PATTERN.exec(value);
  return m ? { scope: m[1], type: m[2], name: m[3] } : undefined;
}

/** 找出源码中所有 `$r('...')` / `$rawfile('...')` 字符串引用。 */
export function findResourceRefs({ source, sourceFile: sf }: ParsedArkTS): ResourceRef[] {
  const t = ts();
  const refs: ResourceRef[] = [];
  const visit = (node: TS.Node): void => {
    if (t.isCallExpression(node) && t.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      const arg = node.arguments[0];
      if ((fn === '$r' || fn === '$rawfile') && arg && (t.isStringLiteral(arg) || t.isNoSubstitutionTemplateLiteral(arg))) {
        const start = source.toOriginal(arg.getStart(sf) + 1);
        refs.push({
          kind: fn === '$r' ? 'r' : 'rawfile',
          value: arg.text,
          start,
          end: start + arg.text.length,
          callStart: source.toOriginal(node.getStart(sf)),
          callEnd: source.toOriginal(node.getEnd()),
        });
      }
    }
    t.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

export interface CompletionContext {
  kind: RefKind;
  /** 光标前已经输入的字符串内容。 */
  prefix: string;
  /** 使用的引号，用于判断是否需要补全右引号。 */
  quote: string;
}

const COMPLETION_PATTERN = /\$(r|rawfile)\(\s*(['"`])([^'"`]*)$/;

/** 根据光标前的文本判断是否正在 `$r('...` 中输入。 */
export function resourceCompletionContext(textBeforeCursor: string): CompletionContext | undefined {
  const m = COMPLETION_PATTERN.exec(textBeforeCursor);
  if (!m) return undefined;
  return { kind: m[1] === 'r' ? 'r' : 'rawfile', quote: m[2], prefix: m[3] };
}
