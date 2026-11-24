import * as vscode from 'vscode';
import { classifyResourcePath, parseElementFile, ResourceType } from '../core/resources';

export interface ResourceItem {
  type: ResourceType;
  name: string;
  /** 限定词目录，例如 base、zh_CN、dark。 */
  qualifier: string;
  /** 元素资源的值；media/profile 为文件名。 */
  value: string;
  uri: vscode.Uri;
  /** 元素资源中 name 字段的位置；文件类资源为空。 */
  nameRange?: { start: number; end: number };
}

export interface RawFileItem {
  path: string;
  uri: vscode.Uri;
}

const INCLUDE = '**/resources/**';
const EXCLUDE = '{**/node_modules/**,**/oh_modules/**,**/build/**,**/.hvigor/**,**/.preview/**,**/.git/**}';
const EXCLUDED_SEGMENT = /\/(node_modules|oh_modules|build|\.hvigor|\.preview|\.git)\//;

interface FileEntries {
  items: ResourceItem[];
  rawfile?: RawFileItem;
}

/**
 * 工作区资源索引：扫描所有 `resources` 目录，支持 element（string/color/...）、
 * media、profile 与 rawfile，并随文件变化增量更新。
 */
export class ResourceIndex implements vscode.Disposable {
  private readonly files = new Map<string, FileEntries>();
  private byKey = new Map<string, ResourceItem[]>();
  private rawfiles = new Map<string, RawFileItem>();
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private scanning: Promise<void> | undefined;
  private rebuildTimer: ReturnType<typeof setTimeout> | undefined;

  /** 索引内容变化（防抖后触发）。 */
  readonly onDidChange = this.emitter.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(INCLUDE);
    const update = (uri: vscode.Uri) => void this.updateFile(uri).then(() => this.scheduleRebuild());
    const remove = (uri: vscode.Uri) => {
      // 删除目录时只会收到目录本身的事件
      const prefix = uri.toString() + '/';
      for (const key of [...this.files.keys()]) if (key === uri.toString() || key.startsWith(prefix)) this.files.delete(key);
      this.scheduleRebuild();
    };
    this.disposables.push(
      watcher,
      watcher.onDidCreate(update),
      watcher.onDidChange(update),
      watcher.onDidDelete(remove),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.refresh()),
    );
  }

  /** 等待首次扫描完成。 */
  ready(): Promise<void> {
    return (this.scanning ??= this.scan());
  }

  /** 重新扫描整个工作区。 */
  refresh(): Promise<void> {
    this.scanning = this.scan();
    return this.scanning;
  }

  get isEmpty(): boolean {
    return this.files.size === 0;
  }

  get hasRawfiles(): boolean {
    return this.rawfiles.size > 0;
  }

  lookup(type: string, name: string): readonly ResourceItem[] {
    return this.byKey.get(`${type}.${name}`) ?? [];
  }

  /** 每个 type.name 只返回一个代表项（优先 base 目录）。 */
  allItems(): ResourceItem[] {
    return [...this.byKey.values()].map((items) => items.find((i) => i.qualifier === 'base') ?? items[0]);
  }

  rawfile(path: string): RawFileItem | undefined {
    return this.rawfiles.get(path);
  }

  allRawfiles(): RawFileItem[] {
    return [...this.rawfiles.values()];
  }

  /** 解析颜色资源的值，支持 `$color:other` 形式的引用。 */
  resolveColor(name: string, depth = 0): string | undefined {
    const items = this.lookup('color', name);
    const item = items.find((i) => i.qualifier === 'base') ?? items[0];
    if (!item) return undefined;
    const ref = /^\$color:(.+)$/.exec(item.value);
    if (ref) return depth < 5 ? this.resolveColor(ref[1], depth + 1) : undefined;
    return item.value;
  }

  private async scan(): Promise<void> {
    const uris = await vscode.workspace.findFiles(INCLUDE, EXCLUDE);
    this.files.clear();
    // 分批读取，避免大工程一次性打开过多文件
    for (let i = 0; i < uris.length; i += 64) {
      await Promise.all(uris.slice(i, i + 64).map((uri) => this.updateFile(uri)));
    }
    this.rebuild();
  }

  private async updateFile(uri: vscode.Uri): Promise<void> {
    const info = classifyResourcePath(uri.path);
    if (!info || EXCLUDED_SEGMENT.test(uri.path)) return;
    const key = uri.toString();
    if (info.kind === 'rawfile') {
      this.files.set(key, { items: [], rawfile: { path: info.path, uri } });
      return;
    }
    if (info.kind === 'media' || info.kind === 'profile') {
      const file = uri.path.slice(uri.path.lastIndexOf('/') + 1);
      this.files.set(key, { items: [{ type: info.kind, name: info.name, qualifier: info.qualifier, value: file, uri }] });
      return;
    }
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      const items = parseElementFile(text).map<ResourceItem>((e) => ({
        type: e.type,
        name: e.name,
        qualifier: info.qualifier,
        value: e.value,
        uri,
        nameRange: { start: e.nameStart, end: e.nameEnd },
      }));
      this.files.set(key, { items });
    } catch {
      this.files.delete(key);
    }
  }

  private scheduleRebuild(): void {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.rebuild(), 300);
  }

  private rebuild(): void {
    const byKey = new Map<string, ResourceItem[]>();
    const rawfiles = new Map<string, RawFileItem>();
    for (const entry of this.files.values()) {
      for (const item of entry.items) {
        const key = `${item.type}.${item.name}`;
        const list = byKey.get(key);
        if (list) list.push(item);
        else byKey.set(key, [item]);
      }
      if (entry.rawfile) rawfiles.set(entry.rawfile.path, entry.rawfile);
    }
    for (const list of byKey.values()) list.sort((a, b) => qualifierOrder(a.qualifier) - qualifierOrder(b.qualifier) || a.qualifier.localeCompare(b.qualifier));
    this.byKey = byKey;
    this.rawfiles = rawfiles;
    this.emitter.fire();
  }

  dispose(): void {
    clearTimeout(this.rebuildTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}

const qualifierOrder = (q: string) => (q === 'base' ? 0 : 1);
