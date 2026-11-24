<p align="center">
  <img src="assets/nav_arkts.png" width="96" alt="ArkTS">
</p>

<h1 align="center">ArkTS for VS Code</h1>

<p align="center">
  在 VS Code 中编写 HarmonyOS / OpenHarmony 应用（<code>.ets</code>）：<br>
  精准高亮 · 组件大纲 · 格式化 · 装饰器与组件补全 · <code>$r</code> 资源补全 / 跳转 / 校验 · ARGB 颜色选择器 · 代码片段
</p>

---

> 本扩展为个人维护的开源项目，与华为 / OpenHarmony 官方无关。它是轻量级的编辑辅助工具，**不做**类型检查和编译。完整的类型系统、预览器与调试请使用 DevEco Studio。

## 目录

- [功能](#功能)
  - [语法高亮](#语法高亮)
  - [大纲与面包屑](#大纲与面包屑)
  - [格式化](#格式化)
  - [装饰器与组件补全](#装饰器与组件补全)
  - [悬停文档](#悬停文档)
  - [资源：补全、预览、跳转与校验](#资源补全预览跳转与校验)
  - [颜色选择器](#颜色选择器)
  - [代码片段](#代码片段)
- [安装](#安装)
- [配置项](#配置项)
- [命令](#命令)
- [常见问题](#常见问题)
- [开发](#开发)
- [许可证](#许可证)

## 功能

### 语法高亮

语法文件由微软官方 [TypeScript TextMate 语法](https://github.com/microsoft/TypeScript-TmLanguage) 自动生成，再叠加 ArkTS 特有语法，因此：

- **TypeScript 部分与 VS Code 内置 TS 高亮完全一致**：泛型、类型注解、模板字符串、正则、箭头函数、可选链、装饰器参数……
- **ArkTS 特有语法有专属作用域**，主题可以单独着色：

| 语法 | 示例 | 作用域 |
| --- | --- | --- |
| struct 声明 | `struct Index {}` | `storage.type.struct.ets` |
| 内置装饰器 | `@State` `@ComponentV2` `@Monitor` | `support.function.decorator.arkts.ets` |
| 自定义装饰器 | `@MyDecorator` | `entity.name.function.decorator.ets` |
| 内置组件 | `Column()` `Text()` `List()` | `support.class.component.arkts.ets` |
| 渲染控制 | `ForEach()` `LazyForEach()` `Repeat<T>()` | `support.function.rendering-control.arkts.ets` |
| 资源引用 | `$r()` `$rawfile()` | `support.function.resource.arkts.ets` |
| 双向绑定 | `$$this.value` | `keyword.operator.binding.arkts.ets` |

不会误伤普通标识符：`const struct = 1`、`obj.Column()` 仍按普通 TS 高亮。Markdown 中的 ` ```arkts ` / ` ```ets ` 代码块同样会被高亮。

### 大纲与面包屑

「大纲」视图、顶部面包屑、`Ctrl/Cmd + Shift + O` 都能看到：

- `struct` / 类 / 接口 / 枚举 / 函数，以及成员上的**装饰器与类型**（如 `count  @Prop @Watch('onChange') number`）；
- `build()`、`@Builder`、`@LocalBuilder` 中的 **UI 组件树**，包括 `if / else` 分支、`ForEach` / `LazyForEach` / `Repeat` 的子组件、组件的首个参数：

```text
struct Index                 @Entry @Component
├─ message                   @State string
├─ aboutToAppear
└─ build
   └─ Column                 { space: 12 }
      ├─ Text                this.message
      ├─ List                { scroller: this.scroller }
      │  └─ ForEach          this.tasks
      │     └─ ListItem
      │        └─ Row
      └─ if (this.selected)
         └─ Button           $r('app.string.ok')
```

组件节点的范围覆盖尾随闭包和整条属性链，点击即可选中整个组件。可通过 `arkts.outline.showComponentTree` 关闭组件树。

### 格式化

「格式化文档」（`Shift + Alt + F`）与「格式化选区」基于 TypeScript 官方格式化引擎，并针对 ArkUI 写法做了专门处理：

```ts
// 格式化前
struct   Foo {
@State   n:number=0
build(){
Column(){
Text('x')
}
.width('100%')
.height('100%')
}
}

// 格式化后
struct Foo {
  @State n: number = 0
  build() {
    Column() {
      Text('x')
    }
    .width('100%')
    .height('100%')
  }
}
```

- 尾随闭包后的属性链（`}.width()`）与 `@Extend` / `@Styles` 函数体中的属性链**与首行对齐**，而不是像 TS 那样多缩进一级；
- `Column(){` 自动补空格为 `Column() {`；
- 「插入分号」模式下**不会**在 `Column()` 与它的尾随闭包之间插入分号（那会改变语义）；
- 支持空格 / Tab 缩进、CRLF，结果幂等（重复格式化不再变化）。

默认已将本扩展设为 `[arkts]` 的默认格式化程序，缩进为 2 个空格，可在设置中覆盖。

### 装饰器与组件补全

- 输入 `@` 提示 40 个内置装饰器（V1 / V2 状态管理、组件、UI 构建、并发），**按位置过滤**：在 `struct` 外提示 `@Entry`、`@Component`、`@Observed` 等，在成员位置提示 `@State`、`@Link`、`@Param`、`@Monitor` 等；
- 在语句开头输入大写字母时提示 90 个内置组件和渲染控制语法，自动插入括号和尾随闭包（容器组件）或只插入括号（`Text`、`Image` 等）；
- 每个补全项都附带中文说明和官方文档链接。

### 悬停文档

把鼠标悬停在装饰器（`@State`）、内置组件（`Column(`）或渲染控制（`ForEach(`）上，显示中文说明、适用范围、子组件要求以及 [OpenHarmony 官方文档](https://gitee.com/openharmony/docs) 链接。

### 资源：补全、预览、跳转与校验

扩展会自动索引工作区内所有模块的 `resources` 目录（`element`、`media`、`profile`、`rawfile`），并随文件增删改实时更新：

```text
entry/src/main/resources/
├─ base/element/string.json     → app.string.xxx
├─ base/element/color.json      → app.color.xxx
├─ zh_CN/element/string.json    → 多语言取值
├─ base/media/icon.png          → app.media.icon
├─ base/profile/main_pages.json → app.profile.main_pages
└─ rawfile/img/logo.png         → $rawfile('img/logo.png')
```

| 功能 | 说明 |
| --- | --- |
| **补全** | 在 `$r('` 中列出全部资源，显示取值；颜色资源带色块。在 `$rawfile('` 中列出 rawfile 文件路径 |
| **悬停** | 以表格显示各限定词目录（`base`、`zh_CN`、`dark`……）下的取值；图片资源直接预览 |
| **跳转到定义** | `F12` / `Ctrl+点击` 跳到 JSON 中对应条目（多语言时列出全部），或打开 media / rawfile 文件 |
| **校验** | 引用不存在的资源、拼错资源类型、格式不正确时给出警告 |

`sys.*` 系统资源和 `[模块名].type.name` 跨模块引用不做校验。工作区里找不到任何 `resources` 目录时（例如只打开了单个文件）会自动跳过校验，避免误报。

### 颜色选择器

ArkTS 的 8 位十六进制颜色是 **`#AARRGGBB`（透明度在前）**，与 CSS 的 `#RRGGBBAA` 相反，通用颜色插件会显示错误的颜色。本扩展按 ArkTS 规则解析并显示色块，点击色块可用颜色选择器修改：

| 写法 | 示例 |
| --- | --- |
| 十六进制字符串 | `'#F00'` `'#8F00'` `'#FF0000'` `'#80FF0000'` |
| rgb / rgba | `'rgb(0, 125, 255)'` `'rgba(0, 0, 0, 0.5)'` |
| Color 枚举 | `Color.Red` `Color.Transparent` |
| 数字（仅颜色属性中） | `.fontColor(0xFF0000)` `.backgroundColor(0x80FF0000)` |
| 颜色资源 | `$r('app.color.primary')`（只读，会解析 `$color:xxx` 引用） |

修改透明度后会自动输出 `#AARRGGBB`，不透明时输出 `#RRGGBB`。

### 代码片段

61 个带中文说明的代码片段，输入前缀后按 `Tab` 展开：

| 分类 | 前缀 |
| --- | --- |
| 组件 | `entry` `component` `componentv2` `customdialog` `dialogcontroller` |
| UI 构建 | `builder` `builderfn` `localbuilder` `builderparam` `styles` `extend` |
| V1 状态管理 | `state` `prop` `link` `provide` `consume` `objectlink` `watch` `observed` |
| V2 状态管理 | `local` `param` `event` `provider` `consumer` `monitor` `computed` `observedv2` |
| 应用状态 | `storagelink` `storageprop` `localstoragelink` |
| 生命周期 | `abouttoappear` `abouttodisappear` `onpageshow` `onpagehide` `onbackpress` `abouttoreuse` `ondidbuild` |
| 渲染控制 | `foreach` `lazyforeach` `repeat` `ifui` |
| 布局 | `column` `row` `stack` `flex` `relativecontainer` `scroll` `list` `grid` `tabs` `navigation` `navdestination` `swiper` |
| 基础组件 | `text` `button` `image` `textinput` |
| 其他 | `imp` `pushurl` `hilog` `log` |

## 安装

- **扩展市场**：在 VS Code 扩展视图中搜索 `ArkTS`（发布者 `kkaaddff`）；
- **手动安装**：从 [Releases](https://github.com/kkaaddff/vscode-ets/releases) 下载（或按下文「开发」一节自行 `npm run package` 构建）`.vsix`，执行 `code --install-extension arkts-ets-1.0.0.vsix`，或在扩展视图右上角 `…` → 「从 VSIX 安装」。

要求 VS Code 1.87 或更高版本。扩展在打开 `.ets` 文件时激活，所有功能在本地运行，不联网、不需要 HarmonyOS SDK。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `arkts.format.enable` | `true` | 启用格式化 |
| `arkts.format.semicolons` | `"ignore"` | 分号处理：`ignore` 保持原样 / `insert` 补充 / `remove` 删除 |
| `arkts.format.insertSpaceInEmptyBraces` | `false` | 空大括号中是否插入空格：`() => { }` |
| `arkts.outline.showComponentTree` | `true` | 大纲中显示 UI 组件树 |
| `arkts.completion.components` | `true` | 语句开头提示内置组件 |
| `arkts.diagnostics.resources` | `true` | 校验 `$r()` / `$rawfile()` 引用的资源 |
| `arkts.colorDecorators` | `true` | 显示颜色色块与颜色选择器 |

缩进宽度、Tab / 空格使用 VS Code 的 `editor.tabSize` / `editor.insertSpaces`（`[arkts]` 默认 2 个空格）。

## 命令

| 命令 | 说明 |
| --- | --- |
| `ArkTS: 重新索引资源文件` | 手动重新扫描所有 `resources` 目录（一般无需使用，索引会自动更新） |

## 常见问题

**为什么没有类型检查、跳转到变量定义、自动导入？**
这些需要 ArkTS 编译器和 HarmonyOS SDK 的类型声明，超出了轻量编辑插件的范围。本扩展专注于不依赖 SDK 也能做好的部分。完整的语言服务请使用 DevEco Studio。

**格式化结果和 DevEco Studio 不完全一样？**
格式化基于 TypeScript 引擎，并针对属性链、尾随闭包做了适配，遵循 ArkUI 官方示例代码的常见风格，但并非 DevEco Studio 格式化器的复刻。如遇到格式不理想的写法，欢迎提 Issue 并附上代码片段。

**和其他格式化工具冲突？**
本扩展只在 `[arkts]` 语言下设置默认格式化程序。如需使用其他工具，在设置中修改 `"[arkts]": { "editor.defaultFormatter": "..." }`，或关闭 `arkts.format.enable`。

**资源校验误报？**
请确认资源文件位于 `<模块>/src/main/resources/<限定词>/element/*.json` 这样的标准目录中。`node_modules`、`oh_modules`、`build`、`.hvigor`、`.preview` 目录不会被索引。可通过 `arkts.diagnostics.resources` 关闭校验。

## 开发

```bash
npm install
npm run build             # 打包扩展到 dist/
npm run watch             # 监听模式
npm run typecheck         # 类型检查
npm test                  # 语法测试 + 单元测试
npm run test:integration  # 在独立下载的 VS Code 中运行集成测试
npm run package           # 生成 .vsix
```

在 VS Code 中按 `F5` 启动「运行扩展」，会打开 `test/fixtures/project` 示例工程进行调试。

### 项目结构

```text
src/
├─ extension.ts          入口：注册所有语言功能
├─ core/                 与 VS Code 无关的纯逻辑（可直接单元测试）
│  ├─ source.ts          ArkTS → TS 预处理（struct → class，偏移双向映射）
│  ├─ symbols.ts         大纲（含 UI 组件树）
│  ├─ format.ts          格式化（TS 格式化引擎 + ArkUI 布局修正）
│  ├─ resources.ts       资源文件解析、$r 引用查找
│  ├─ colors.ts          ARGB 颜色解析与格式化
│  └─ data.ts            装饰器 / 组件数据
├─ features/             VS Code 提供程序（补全、悬停、定义、诊断、颜色……）
└─ data/                 装饰器、组件元数据（同时用于生成语法文件）
scripts/
├─ build-grammar.mjs     由 TypeScript 语法生成 syntaxes/arkts.tmLanguage.json
├─ build.mjs             esbuild 打包
└─ tokenize.mjs          调试用：打印文件的分词结果
test/
├─ grammar/              语法作用域断言测试
├─ fixtures/             示例工程与高亮快照
├─ unit/                 核心逻辑单元测试（node:test）
└─ integration/          扩展宿主集成测试
```

### 工作原理

ArkTS 在语法上几乎是 TypeScript 的子集，唯一破坏 TS 语法结构的是 `struct` 关键字。扩展在内存中把声明位置的 `struct`（用 TS 扫描器识别，跳过字符串、注释、模板和正则）替换为 `class`，交给 TypeScript 解析器得到准确的语法树，再把所有位置映射回原文。大纲、格式化、补全上下文、资源与颜色查找都基于这棵按文档版本缓存的语法树。TypeScript 编译器被打包进扩展并延迟加载。

### 添加装饰器或组件

编辑 `src/data/decorators.json` 或 `src/data/components.json`，然后运行 `npm run build:grammar` 重新生成语法文件。补全、悬停和高亮会同时生效。语法文件 `syntaxes/arkts.tmLanguage.json` 由脚本生成，请勿手动修改（CI 会校验它是否最新）。

## 许可证

[MIT](LICENSE)。语法文件基于 [microsoft/TypeScript-TmLanguage](https://github.com/microsoft/TypeScript-TmLanguage)（MIT），第三方声明见 [ThirdPartyNotices.txt](ThirdPartyNotices.txt)。
