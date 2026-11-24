import componentData from '../data/components.json';
import decoratorData from '../data/decorators.json';

/** 装饰器可以修饰的目标。 */
export type DecoratorTarget = 'struct' | 'class' | 'member' | 'method' | 'function';

export interface DecoratorInfo {
  name: string;
  target: DecoratorTarget;
  group: string;
  summary: string;
  detail?: string;
  /** 补全时插入的片段（不含 `@`）。 */
  snippet: string;
  doc: string;
}

export interface ComponentInfo {
  name: string;
  summary: string;
  children: string;
  doc: string;
}

export interface RenderingControlInfo {
  name: string;
  summary: string;
  signature: string;
  doc: string;
}

export const DECORATORS: readonly DecoratorInfo[] = decoratorData as DecoratorInfo[];
export const COMPONENTS: readonly ComponentInfo[] = componentData.components;
export const RENDERING_CONTROLS: readonly RenderingControlInfo[] = componentData.renderingControl;

export const decoratorByName = new Map(DECORATORS.map((d) => [d.name, d]));
export const componentByName = new Map(COMPONENTS.map((c) => [c.name, c]));
export const renderingControlByName = new Map(RENDERING_CONTROLS.map((c) => [c.name, c]));

const DOC_BASE = 'https://gitee.com/openharmony/docs/blob/master/zh-cn/application-dev/';

/** OpenHarmony 官方文档地址。 */
export function docUrl(path: string): string {
  return DOC_BASE + path;
}

export const RESOURCE_DOC = docUrl('quick-start/resource-categories-and-access.md');
