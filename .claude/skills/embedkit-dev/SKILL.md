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
next.config.ts               含 experimental.globalNotFound（根布局在 [locale] 里，缺了它 404 会掉回 Next 默认页）
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
    tools/<slug>/page.tsx    工具页：取文案 + <ToolShell> + 交互组件
components/
  ui/                        shadcn 生成的原语（尽量别手改；当前 dropdown-menu / tabs 没人引用）
  layout/                    页头 / 页脚 / 语言切换 / 主题切换
  tools/tool-shell.tsx       所有工具页共用的标题外壳
  tools/<slug>/              工具的交互壳（'use client'，只做状态与渲染）
lib/
  site.ts                    SITE_URL + pageAlternates（canonical / hreflang）
  tools-meta.ts              工具清单单一数据源（首页、分类、卡片、sitemap 全由它派生）
  tools-text.ts              按 slug 取工具文案
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

### 坑 3：本机沙箱里 build/start 需要绕过 SWC 缓存

在这个仓库上以受沙箱限制的身份跑 `pnpm build` / `pnpm start`，SWC 会试图把原生绑定缓存写进 `~/Library/Caches/swc-native-501/` 而被拒（`ERR_SWC_NATIVE_CACHE`）。绕过：

```bash
SWC_NATIVE_BINDING_CACHE=/private/tmp/swc-native pnpm build
```

CI 和用户自己的终端没有这个限制。

---

## 四、质量闸门

```bash
pnpm lint           # eslint（@antfu/eslint-config）
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest：16 个文件 / 319 用例
pnpm build          # next build（注意坑 2、坑 3）
```

四条全绿才算完成。CI（`.github/workflows/ci.yml`）在 push / PR 上跑同样四条。

测试分布：`lib/core/*.test.ts` 是纯函数（**边界与非法输入必测**），`components/tools/*/*.test.tsx` 是 happy-dom 组件测试（断言值从 `messages/zh.json` 取，不写死中文字面量）。

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

- `base-converter` 与 `onenet-mqtt` **没有组件测试**（其余 6 个都有）。`onenet-mqtt` 组件 400+ 行，最值得补。
- CI 配置齐全，但**从未在 GitHub 上确认跑绿过**（本机 `gh` 未认证）。

**明确不做（是决定，不是遗漏 —— 别再「顺手补上」）**

- **E2E / Playwright**：已有 319 条单测 + 组件测试打底，E2E 的收益（浏览器里跑真实交互）
  抵不过它的代价（几百 MB 浏览器二进制、CI 多一步、跑起来比 vitest 慢一个量级）。
  **除非出现「单测绿但线上坏」的真实事故，否则不引入。**
  代价是这些只能在改动后手工验一遍、验完不留痕：路由可达性、404 是否走站内页、
  `/` 与 `/fr` 的重定向、sitemap 收录、canonical / hreflang、planned 卡片不可点。
  改动这几处时**务必手工 `curl` 一遍**（`pnpm dev` 起着就能验）。
- **`opengraph-image`**：分享到社交平台没有预览图（og:title / og:description 是有的）。
  原始计划里标的就是「可选」。

**与原始计划的差异 / 空头承诺**

原始计划在 `~/.hermes/plans/2026-10-01_185511-embedkit-plan.md`，与现状有这几处出入，别对着计划看走眼：

- **页头没有工具导航**。计划说「首页卡片、导航、sitemap、搜索全部派生自 tools-meta」，实际只有卡片和 sitemap 派生；导航与搜索从未实现（`site-header.tsx` 只有 GitHub / 语言 / 主题）。要么补做，要么别再声称。
- **CRC 比计划少两个能力**：预设里没有 CAN；没有文件输入（计划写的是「输入 HEX / ASCII / 文件」）。24 个预设都是常规的。
- **`tools-meta` 没有计划里的 `keywords` / `needsBackend` 字段**，实际加的是 `needsLocalRuntime`（浏览器+硬件能力，语义不同）和 `externalUrl`。

**其他**

- `components/ui/` 里 `dropdown-menu` 与 `tabs` 两个原语没人引用，可以删。
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

**开工顺序建议**：先补 `base-converter` / `onenet-mqtt` 的组件测试（唯一还没打底的测试欠账），
再决定页头导航补不补（那是唯一的空头承诺）。**E2E 已决定不做**，别顺手引入。
`opengraph-image` 想做就做，优先级低。

---

## 七、其他事实

- **国际化**：`localePrefix: 'always'`，`/zh` 与 `/en` 是独立 URL，靠 `lib/site.ts` 的 `pageAlternates` 互相声明 hreflang；换域名只改 `SITE_URL`。
- **部署**：Vercel，`main` 自动部署。无环境变量、无数据库、无后端。
- **README 只放用户视角的内容**（是什么、有哪些工具、怎么跑、怎么部署）。开发约定、目录结构、坑、进度、计划都在这份 skill 里 —— README 不要再堆这些。
