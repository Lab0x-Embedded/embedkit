---
name: embedkit-dev
description: "Use when working on the EmbedKit repository (github.com/Lab0x-Embedded/embedkit, live at embedkit.ryanuo.cc) — any change to its Next.js pages, lib/core pure functions, shadcn/ui components, i18n messages, tests, README or deploy setup. Contains the directory layout, the five project conventions, the three local-dev traps that have already burned us (a foreign Service Worker hijacking localhost:3000, dev/build sharing .next, and the sandboxed SWC cache), the quality gates, what is already shipped, and what is planned next. Load this before editing anything here so you add tools the way this repo expects instead of inventing a new structure. 中文项目，注释与文档都用中文。"
license: MIT
---

# EmbedKit 开发文档

面向嵌入式开发的在线工具集。**所有计算在浏览器本地完成，输入不上传服务器。**

- 线上：<https://embedkit.ryanuo.cc>
- 仓库：<https://github.com/Lab0x-Embedded/embedkit>
- 栈：Next.js 16（App Router / Turbopack）· React 19 · TS · Tailwind v4 · shadcn/ui（radix-nova）· next-intl（zh/en）· Vitest · pnpm

> 沟通、注释、提交信息、文档**一律用中文**。代码标识符、类型、API 名保持英文。

---

## 一、目录结构

```
next.config.ts               含 experimental.globalNotFound（缺了它未匹配路由的 404 会掉回 Next 默认页）
                             和 outputFileTracingIncludes（把 assets/og 的字体带进 OG 图片路由）
assets/og/                    OG 卡片用的中文字体**子集** + 字符集清单 + OFL 许可
scripts/build-og-font.mjs     从 Google Fonts 取子集字体的脚本（改文案后要跑）
proxy.ts                     Next 16 把 middleware 改名成了 proxy.ts（next-intl 的 locale 路由）
app/
  sitemap.ts / robots.ts     SEO 产物，从 tools-meta 派生
  global-error.tsx           根布局级别的兜底错误页
  global-not-found.tsx       没匹配到路由的 404（根布局在 [locale] 里，只能用它）
  globals.css                Tailwind v4 + shadcn 设计令牌
  [locale]/                  页面（Server Component，只做取文案与布局）
    page.tsx                 首页：分类 + 工具卡片（含禁用态）
    not-found.tsx            代码里 notFound() 抛出的 404
    error.tsx                工具页错误边界（重试）
    opengraph-image.tsx      首页的 OG 卡片图（next/og 生成）
    tools/<slug>/page.tsx    工具页：取文案 + <ToolShell> + 交互组件
    tools/<slug>/opengraph-image.tsx  每个工具自己的 OG 卡片图
components/
  ui/                        shadcn 生成的原语（尽量别手改；当前只剩 tabs 没人引用）
  layout/                    页头 / 页脚 / 语言切换 / 主题切换
  layout/tools-nav.tsx       页头的「工具」下拉（由 tools-meta 派生，和卡片/sitemap 同源）
  tools/tool-shell.tsx       所有工具页共用的标题外壳
  tools/<slug>/              工具的交互壳（'use client'，只做状态与渲染）
lib/
  site.ts                    SITE_URL + pageAlternates（canonical / hreflang）
  tools-meta.ts              工具清单单一数据源（首页、分类、卡片、sitemap 全由它派生）
  tools-text.ts              按 slug 取工具文案
  og-text.ts                 OG 卡片文案（**字体子集的字符集由它决定**，纯函数可测）
  og.tsx                     OG 卡片渲染器（next/og + Satori，server-only）
  utils.ts                   cn()
  i18n.test.ts               文案与清单的一致性校验（见下方「质量闸门」）
  core/*.ts                  工具算法：纯函数 + 同名单测
  browser/*.ts               浏览器 API 封装（Web Serial、localStorage），只在客户端跑
i18n/                        next-intl 路由 / 请求配置
messages/{zh,en}.json        文案
public/preview.png           README 里的首页预览图
.claude/skills/embedkit-dev/ 这份开发文档
```

关键点：**`lib/tools-meta.ts` 是唯一数据源**。首页卡片、分类计数、`sitemap.xml` 全部由它派生，所以加工具只改数据 + 文案 + 两个文件，不要另建一套清单。

---

## 二、五条约定

1. **算法与 UI 分离**：`lib/core/*.ts` 不许 import React、不许碰 DOM，全部可单测；UI 只负责状态、渲染和复制。
2. **加一个工具 = 五处改动**（照做，别自创结构）：
   - `lib/tools-meta.ts` 加一条，先 `status: 'planned'`，做完改 `'done'`
   - `messages/{zh,en}.json` 的 `Tools.<slug>` 加 `name` / `desc`
   - `lib/core/<name>.ts` + 同名单测
   - `components/tools/<slug>/`（`'use client'`）
   - `app/[locale]/tools/<slug>/page.tsx`（照抄现有页面，套 `ToolShell`）
   `lib/i18n.test.ts` 会强制前两步对齐，漏了直接红。

   **外链工具**（功能在别的站点）同理，多两件事：`ToolMeta.externalUrl` 填外站地址、
   `category` 用 `ext`，组件做成「拼深链 + 跳转」的入口页而不是真工具。
   现有例子 `pin-lookup` → PinAtlas：URL 拼装全在 `core/pinatlas.ts`，
   **纯函数 + 单测**，别把拼接逻辑写进组件。
3. **不做假入口**：没实现的工具在首页是灰色禁用卡并标注「规划中」，不给点了报错的按钮；只有 `'done'` 才会进 sitemap。
4. **纯本地计算**：工具页不发任何请求；敏感输入（密钥等）只留在内存里，不写 localStorage。
5. **文案进 messages**：组件里不写死中英文；测试也从 `messages/zh.json` 取断言值，改文案不会让测试变红。

**依赖原则：能用成熟库就不自己写。** 已经这样用起来的：`js-crc`（CRC 模型目录，187 个模型来自 reveng catalogue）、`ansi_up`（ANSI 转义）、Web Crypto（OneNET HMAC，不引 crypto-js）、BigInt（进制与位运算）。
反例教训：CRC 一开始是手写的，被指出后才换成 `js-crc` —— 手写意味着一份没人验证的参数表。

### OG 卡片图：改文案后**必须**重新生成字体

分享到社交平台的预览图由 `next/og`（Satori）在构建时生成：首页一张，每个工具各一张。
两个硬约束（来自 `next/dist/docs` 的 image-response 一节）：

- bundle 上限 **500KB**，而完整 Noto Sans SC 有 10MB+ → **字体必须做子集**
- Satori **不认 woff2**，只认 ttf / otf / woff

所以 `assets/og/*.ttf` 是「只含卡片上会出现的那些字」的子集（两个权重各 53KB）。
**只要改了会出现卡片上的文案**（messages 里首页的 title/intro、各工具的名字与说明、分类名），
就要重新生成字体：

```bash
UPDATE_OG_CHARSET=1 pnpm test -- lib/og.test.ts   # 同步 assets/og/charset.txt
node scripts/build-og-font.mjs                     # 按新字符集重新取子集
```

漏了这步会怎样：`lib/og.test.ts` 直接红，并把上面两条命令打给你。
新增工具时最容易踩 —— 工具名里出现一个字不在子集里，那张卡就是一个豆腐块。

装饰字符（卡片左上角那个 `>_`）不在文案里，但也要有字形，
所以它们单独列在 `lib/og-text.ts` 的 `DECORATIVE` 里 —— **加装饰字符也要重新生成字体**。

---

## 三、开发环境的坑（都是真踩过的）

### 坑 1：`localhost:3000` 是共享 origin，别的项目残留的 Service Worker 会劫持它

**症状**：浏览器里报 `chunk.reason.enqueueModel is not a function` 这类 RSC 错误，dev 指示器显示 `(stale)`，**但 `curl` 一切正常**（curl 不执行 SW，所以命令行验证有盲区）。

**原因**：别的项目（本机上是 PinAtlas）在 `localhost:3000` 上注册过 Service Worker。SW 按 origin 生效，不管当前跑的是哪个项目。它会拦截请求、从 CacheStorage 喂**旧的 JS chunk**，导致客户端运行时和服务端 payload 对不上。

**排查**：

```
F12 → Application → Service Workers → 找到 localhost:3000 → Unregister
    → Storage → Clear site data → Cmd+Shift+R
```

找不到条目时走 `chrome://settings/content/all?searchSubject=localhost` 一次清干净。

**预防**：给每个项目固定的、不重叠的端口；或用不同 hostname（`embedkit.localhost:3000` 与 `pinatlas.localhost:3000` 算不同 origin）。

### 坑 2：`pnpm dev` 和 `pnpm build` 别同时跑

两者共用 `.next/`。Next 16 里 dev 产物在 `.next/dev`、production 在 `.next/static`，比过去安全，但 manifest 仍有交叉。出现莫名其妙的构建报错就 `rm -rf .next` 重来。

**推论**：跑 `pnpm build` 前先确认 3000 端口没有 dev server 在监听（`lsof -nP -iTCP:3000 -sTCP:LISTEN`）。如果用户正在跑 dev，**不要**为了「验证一下」就跑 build。

### 坑 3：OG 图片路由不声明 `generateStaticParams` 会变成「按需渲染」

文件约定生成的 `opengraph-image` **不会自动继承父级的静态参数**。不声明的话
构建产物里是 `ƒ (Dynamic)` —— 运行时才渲染，于是 `readFile('assets/og/...')`
成了线上依赖（字体没被追踪进去就是 tofu 或 500）。

每个 OG 路由都要自己写一遍：

```tsx
export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}
```

声明之后构建产物变成 `● (SSG)`，18 张图（9 路由 × 2 语言）都在构建时生成完，
运行时不再需要字体文件。`next.config` 里的 `outputFileTracingIncludes` 是第二道保险。

### 坑 4：本机沙箱里 build/start 需要绕过 SWC 缓存

在这个仓库上以受沙箱限制的身份跑 `pnpm build` / `pnpm start`，SWC 会试图把原生绑定缓存写进 `~/Library/Caches/swc-native-501/` 而被拒（`ERR_SWC_NATIVE_CACHE`）。绕过：

```bash
SWC_NATIVE_BINDING_CACHE=/private/tmp/swc-native pnpm build
```

CI 和用户自己的终端没有这个限制。

### 坑 5：想验构建又不想动 dev server，用隔离副本

`next build` 会覆写 `.next/`，把正在跑的 dev server 搞挂（见坑 2）。
但验证构建很重要（OG 图片、静态生成这类问题只有 build 才暴露）。
安全的做法是复制一份到项目外构建：

```bash
SRC=~/dev/github/embedkit; DST=/private/tmp/embedkit-verify
rm -rf "$DST"; mkdir -p "$DST"
rsync -a --exclude node_modules --exclude .next --exclude .git "$SRC/" "$DST/"
cp -al "$SRC/node_modules" "$DST/node_modules"   # 硬链接，快且不占空间
cd "$DST" && SWC_NATIVE_BINDING_CACHE=/private/tmp/swc-native ./node_modules/.bin/next build
```

两个注意点：
- **`node_modules` 不能做成软链** —— Turbopack 会报
  `Symlink [project]/node_modules is invalid, it points out of the filesystem root`。
  用 `cp -al` 硬链接（是"真目录"，但不复制数据）。
- **不要用 `pnpm build`**：pnpm 会先跑依赖校验，硬链接的 `node_modules` 会被判成
  `workspace hoist directory is not a real directory`。直接调 `./node_modules/.bin/next build`。

验完对照：源仓库的 `.next/dev` 时间戳应该没变，dev server 还活着。

---

## 四、质量闸门

```bash
pnpm lint           # eslint（@antfu/eslint-config）
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest：20 个文件 / 379 用例
pnpm build          # next build（注意坑 2、坑 3）
```

四条全绿才算完成。CI（`.github/workflows/ci.yml`）在 push / PR 上跑同样四条。

测试分布：`lib/core/*.test.ts` 是纯函数（**边界与非法输入必测**），`components/tools/*/*.test.tsx` 是 happy-dom 组件测试（断言值从 `messages/zh.json` 取，不写死中文字面量）。**8 个工具都有组件测试**，另有页头导航与 i18n 的测试。

写组件测试时的两个坑：

- **JSX 相邻元素之间没有空白**，整页 `textContent` 会把它们首尾相接。要数「渲染了几条」
  时不能用 `split(/\s+/)`（会长成一整串），数前缀出现次数更可靠
  （例如 `bodyText().match(/\$sys\//g).length`）。
- **`// @vitest-environment happy-dom` 必须在文件第一行**。如果文件顶部还有 `import type`，
  `eslint --fix` 会把那个 import 提到注释前面，指令就不在首位了。类型需要就从函数推导
  （`Extract<Awaited<ReturnType<typeof fn>>, { ok: true }>`），别加顶层类型导入。

`lib/i18n.test.ts` 是**红色的网**，它守这些不变量（每条都被真实 bug 触发过）：

| 断言 | 拦住的真实问题 |
| --- | --- |
| zh / en 键完全一致、无空文案 | 加工具只写了中文文案 |
| 两种语言占位符相同 | 改了文案忘了同步另一种语言 |
| **没有占位符被 ICU 引号语法吞掉** | 英文 `'{char}'`：ICU 里单引号是转义符，参数不替换且**不报错**，页面直接显示 `{char}` |
| 每条文案都能被 ICU 解析 | 文案里写 C 代码片段 `{ ... }`，运行时抛 INVALID_MESSAGE，只在控制台可见 |
| 分类 / 工具 / CRC 预设与清单双向对齐 | 加了清单条目忘了写文案，首页渲染出键名 |

---

## 五、当前进度

**7 个本地工具全部可用**，另有 1 个外链入口（`ext` 分类），首页没有灰色占位卡。

工具分两类，统计口径不同：**本地工具**（功能在本站内完成）计入「N 个可用」；
**外链工具**（`ToolMeta.externalUrl` 有值，功能在别的站点）单独计一个徽章，**不混进那个数字** ——
否则「8 个可用」里有一个其实在本站干不了活。

| 分类 | slug | 关键实现 | 核心库 |
| --- | --- | --- | --- |
| calc | `base-converter` | 2/8/10/16 互转、补码、字节序 | `core/radix.ts` |
| calc | `crc` | 24 预设 + 自定义参数 + 整帧校验 | `core/crc.ts`（包 `js-crc`） |
| calc | `bitfield` | 8/16/32/64 位网格、字段切片、导出 C 宏 | `core/bitfield.ts`（复用 `radix.interpret`） |
| bytes | `hex-ascii` | 文本/HEX/C 数组三向、Latin-1、hexdump | `core/hexcodec.ts`（复用 `core/serial.ts`） |
| proto | `modbus-frame` | 8 功能码、RTU/TCP 组帧 + 拆帧校验 | `core/modbus.ts`（CRC 复用 `core/crc.ts`） |
| proto | `serial` | Web Serial 收发、分包合并、快捷指令 | `core/serial.ts` + `browser/serial.ts` |
| cloud | `onenet-mqtt` | MQTT 三元组签名、物模型 Topic、ESP-AT | `core/onenet.ts` |
| ext | `pin-lookup` | 拼 PinAtlas 深链跳转（**本站不抓引脚数据、不发请求**） | `core/pinatlas.ts` |

工程侧已做：sitemap / robots、canonical + hreflang + metadataBase、站内 404（含未匹配路由的 `global-not-found`）、错误边界、i18n 一致性 + ICU 校验、`needsLocalRuntime` 提示。

### 已知的债

**测试覆盖**

- CI 配置齐全，但**从未在 GitHub 上确认跑绿过**（本机 `gh` 未认证）。

**明确不做（是决定，不是遗漏 —— 别再「顺手补上」）**

- **E2E / Playwright**：已有 379 条单测 + 组件测试打底，E2E 的收益（浏览器里跑真实交互）
  抵不过它的代价（几百 MB 浏览器二进制、CI 多一步、跑起来比 vitest 慢一个量级）。
  **除非出现「单测绿但线上坏」的真实事故，否则不引入。**
  代价是这些只能在改动后手工验一遍、验完不留痕：路由可达性、404 是否走站内页、
  `/` 与 `/fr` 的重定向、sitemap 收录、canonical / hreflang、planned 卡片不可点。
  改动这几处时**务必手工 `curl` 一遍**（`pnpm dev` 起着就能验）。

**与原始计划的差异 / 空头承诺**

原始计划在 `~/.hermes/plans/2026-10-01_185511-embedkit-plan.md`，与现状有这几处出入，别对着计划看走眼：

- **搜索仍未实现**（导航已在后续补上）。原始计划说「首页卡片、导航、sitemap、**搜索**全部派生自 tools-meta」；
  现在卡片 / 导航 / sitemap 三项都是真的，只有搜索没有 —— 8 个工具用下拉已经够找，
  当**有意不做**即可，别再当成欠账。真要做，数据源现成（同一个 `tools`）。
- **CRC 比计划少两个能力**：预设里没有 CAN；没有文件输入（计划写的是「输入 HEX / ASCII / 文件」）。24 个预设都是常规的。
- **`tools-meta` 没有计划里的 `keywords` / `needsBackend` 字段**，实际加的是 `needsLocalRuntime`（浏览器+硬件能力，语义不同）和 `externalUrl`。

**其他**

- `components/ui/tabs.tsx` 没人引用，可以删（`dropdown-menu` 已被页头工具导航用上）。
- 沙箱里跑 `pnpm build` / `pnpm start` 需要 `SWC_NATIVE_BINDING_CACHE`（见坑 3）。

---

## 六、后续计划

原始计划 16 个工具，**已上线 8 个**（v0.1 六个 + `serial` + `pin-lookup`）。剩下 8 个，按计划原本的分期列出（不要丢掉条目）：

| 原计划阶段 | slug | 工具 |
| --- | --- | --- |
| v0.2 | `float-ieee` | IEEE 754 浮点解析（float32/64 ↔ HEX/BIN，正负 0 / NaN / 次正规） |
| v0.2 | `checksum` | 校验和工厂（累加和 8/16、XOR、BCC、LRC；批量校验一帧里多处校验字段） |
| v0.2 | `timer-calc` | STM32 定时器 / 波特率计算（PSC·ARR → 频率；USARTDIV/BRR 与误差百分比） |
| v0.2 | `can-frame` | CAN 报文解析（标准/扩展帧、ID/IDE/RTR/DLC/Data 位域映射） |
| v0.2 | `adc-calc` | ADC 换算（原始值 ↔ 电压 ↔ 物理量，分辨率/Vref/分压/两点校准） |
| v0.3 | `frame-builder` | 自定义协议帧构建器（帧头/长度/校验可配 + 生成 C 解析代码） |
| v0.3 | `at-commands` | AT 指令速查与填空生成（ESP / 4G 模组） |
| v0.3 | `reference` | 速查表（波特率误差表、CRC 参数表、编码表） |

**明确不做**（需要后端 / 长连接 / 实机）：逻辑分析仪、在线 MQTT 客户端、Modbus 实机主站。

**已外链的**：芯片引脚查询 → PinAtlas（`core/pinatlas.ts`）。这类「隔壁已经有且维护得不错」
的能力一律走 `ext` 外链，不要在本站重建一份数据。

**开工顺序建议**：测试欠账、页头导航、og:image 都已还清。剩下能做的只有两类 ——
① 继续按工具清单推进（见上表 8 个候选）；② 想清理就删掉没人引用的 `components/ui/tabs.tsx`。
CI 没在 GitHub 上确认过，属于「有空顺手看一眼」级别。

**E2E 已决定不做**，别顺手引入。

---

## 七、其他事实

- **国际化**：`localePrefix: 'always'`，`/zh` 与 `/en` 是独立 URL，靠 `lib/site.ts` 的 `pageAlternates` 互相声明 hreflang；换域名只改 `SITE_URL`。
- **部署**：Vercel，`main` 自动部署。无环境变量、无数据库、无后端。
- **README 只放用户视角的内容**（是什么、有哪些工具、怎么跑、怎么部署）。开发约定、目录结构、坑、进度、计划都在这份 skill 里 —— README 不要再堆这些。
