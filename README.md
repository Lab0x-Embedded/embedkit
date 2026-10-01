# EmbedKit · 嵌入式工具箱

面向嵌入式开发的在线工具集：寄存器位域、字节流、校验算法、协议帧、云平台参数。
**所有计算都在浏览器本地完成，输入内容不上传服务器。**

线上地址：<https://embedkit.ryanuo.cc> · 仓库：<https://github.com/Lab0x-Embedded/embedkit>

[English](#english) · [技术栈](#技术栈) · [本地开发](#本地开发) · [部署](#部署vercel) · [约定](#约定) · [路线图](#路线图)

## 工具清单

| 状态 | 工具 | 说明 |
| --- | --- | --- |
| ✅ 可用 | **进制转换** `/tools/base-converter` | 2 / 8 / 10 / 16 互转，BigInt 大数、位宽补码解释、大小端字节序视图 |
| ✅ 可用 | **串口监视器** `/tools/serial` | 浏览器直连串口（Web Serial）：HEX / 文本 / ANSI 彩色日志、分包合并、定时发送、快捷指令、拔插自动重连 |
| ✅ 可用 | **OneNET MQTT 参数生成** `/tools/onenet-mqtt` | ClientID / Username / Password 签名、物模型 Topic、ESP-AT 指令序列 |
| 🚧 规划中 | CRC 计算器 | 通用参数模型（poly / init / refin / refout / xorout）与常用预设 |
| 🚧 规划中 | 位域 / 寄存器可视化 | 逐位查看、置位 / 清零 / 取反，导出 C 宏 |
| 🚧 规划中 | HEX ↔ ASCII / C 数组 | 十六进制与文本互转，生成可回读的 `uint8_t` 数组 |
| 🚧 规划中 | Modbus 报文生成与校验 | RTU（CRC16）与 TCP（MBAP）读写寄存器 / 线圈 |

> 规划中的工具在首页是**灰色禁用卡片**，不做假入口 —— 实现可用后才点亮。
>
> 串口监视器需要桌面版 Chrome / Edge（Web Serial 不支持 Safari、Firefox），
> 且必须在 https 或 localhost 下使用。查到的串口只能由你手动授权，页面不会主动打开设备。

## 技术栈

Next.js 16（App Router / Turbopack）· React 19 · TypeScript ·
Tailwind CSS v4 · shadcn/ui（radix-nova 预设）· next-intl（中英双语）·
@wrksz/themes · Vitest（纯函数 + happy-dom 组件测试）· pnpm · ESLint（@antfu/eslint-config）

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:3000 → 自动跳 /zh
```

质量闸门（提交前跑齐四条）：

```bash
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest（lib/core 纯函数 + components 组件测试）
pnpm build          # next build，产出静态页
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 上跑同样这四条。

## 部署（Vercel）

**当前线上：<https://embedkit.ryanuo.cc>**，由 `main` 分支自动部署。

项目是普通 Next.js 应用：**没有环境变量、没有数据库、没有后端**，不需要任何额外配置。

首次导入（已完成，换机器或重建时照做）：

1. 打开 <https://vercel.com/new>，用 GitHub 登录；
2. 选 `Lab0x-Embedded/embedkit`，Framework Preset 会自动识别成 Next.js；
3. 直接 Deploy —— Root Directory、Build Command、Output Directory 全部保持默认。

之后 `git push origin main` 就会触发生产部署，PR 会拿到独立的 Preview 域名。

绑定自定义域名（当前已绑 `embedkit.ryanuo.cc`）：

1. Vercel 项目 → Settings → Domains → 添加 `embedkit.ryanuo.cc`；
2. 在域名的 DNS 服务商加一条 CNAME：`embedkit` → `cname.vercel-dns.com`；
3. 等 Vercel 显示 Valid Configuration（第一次签发证书通常几分钟）。

两个和部署相关的常量（换域名时改这两处）：

| 文件 | 用途 |
| --- | --- |
| `lib/site.ts` | `SITE_URL`：canonical / hreflang / sitemap / robots 的绝对地址 |
| `components/layout/site-header.tsx` | 页头 GitHub 链接 |

自检：部署完成后访问 `/sitemap.xml`、`/robots.txt`，以及随便一个不存在的路径（应当看到站内的 404 页而不是 Vercel 的默认页）。

> 串口监视器是纯前端 Web Serial，**部署在 Vercel 上照样能用** —— 数据不经过服务器。
> 限制只来自浏览器：需要桌面版 Chrome / Edge，且必须 https 或 localhost。

## 目录结构

```
app/
  sitemap.ts / robots.ts     SEO 产物，从 tools-meta 派生
  global-error.tsx           根布局级别的兜底错误页
  [locale]/                  页面（Server Component，只做取文案与布局）
    page.tsx                 首页：分类 + 工具卡片（含禁用态）
    not-found.tsx            站内 404（保留页头页脚与主题）
    error.tsx                工具页错误边界（重试）
    tools/<slug>/page.tsx    工具页：取文案 + <ToolShell> + 交互组件
components/
  ui/                        shadcn 生成的原语
  layout/                    页头 / 页脚 / 语言切换 / 主题切换
  tools/tool-shell.tsx       所有工具页共用的标题外壳
  tools/<slug>/              工具的交互壳（'use client'，只做状态与渲染）
lib/
  site.ts                    站点绝对地址与 canonical / hreflang 生成
  tools-meta.ts              工具清单单一数据源（首页、分类、卡片、sitemap 全由它派生）
  tools-text.ts              按 slug 取工具文案
  core/*.ts                  工具算法：纯函数 + 同名单测
  browser/*.ts               浏览器 API 封装（Web Serial、localStorage），只在客户端跑
i18n/                        next-intl 路由 / 请求配置
messages/{zh,en}.json        文案
```

## 约定

1. **算法与 UI 分离**：`lib/core/*.ts` 不许 import React、不许碰 DOM，全部可单测；
   UI 只负责状态、渲染和复制。
2. **加一个工具 = 五处改动**：`lib/tools-meta.ts` 加一条（`status: 'done'`）→
   `messages/{zh,en}.json` 的 `Tools.<slug>` 加 name / desc → `lib/core/<name>.ts` + 单测 →
   `components/tools/<slug>/` → `app/[locale]/tools/<slug>/page.tsx`（照抄现有页面，套 `ToolShell`）。
   `lib/i18n.test.ts` 会强制前两步对齐，漏了直接红。
3. **不做假入口**：没实现的工具在首页保持灰色禁用卡片并标注「规划中」，
   而不是给一个点了报错的按钮。`status: 'done'` 才会进 sitemap。
4. **纯本地计算**：工具页不发任何请求；敏感输入（密钥等）只留在内存里。
5. **文案进 messages**：组件里不写死中英文；测试也从 `messages/zh.json` 取断言值，
   改文案不会让测试变红。

## 路线图

- v0.1 进制转换（骨架：i18n、设计系统、纯函数 + 单测）
- v0.2 CRC 计算器、位域 / 寄存器可视化、HEX ↔ ASCII / C 数组
- v0.3 OneNET MQTT 三元组 ✅、Modbus 报文、IEEE 754 浮点解析、STM32 定时器 / 波特率计算
- v0.4 串口监视器（Web Serial API，Chromium 桌面）✅、CAN 报文解析

## English

EmbedKit is a collection of online tools for embedded development — register
bitfields, byte streams, checksum algorithms, protocol frames and cloud platform
credentials. **Everything is computed locally in your browser; nothing you type is
uploaded.**

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · next-intl (zh / en) · Vitest.

```bash
pnpm install && pnpm dev      # http://localhost:3000/en
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Conventions: algorithms live in `lib/core/*.ts` as pure functions with unit tests
(components get happy-dom tests with a fake serial port); browser APIs are wrapped
in `lib/browser/*.ts`. UI components only handle state and rendering. Unimplemented
tools are shown as grey, disabled cards instead of fake entries. The tool list has a
single source of truth in `lib/tools-meta.ts`.

Available today: base converter, **Web Serial monitor** (needs desktop Chrome/Edge
over https or localhost — ports are only opened after you authorise them), and
OneNET MQTT credential generator.

Deploy: **live at <https://embedkit.ryanuo.cc>**, auto-deployed from `main` on Vercel.
It is a plain Next.js app — no environment variables, no database, no backend. Import
the repo at <https://vercel.com/new> and accept the defaults; every push to `main`
ships to production. The custom domain is a CNAME to `cname.vercel-dns.com`. If you
move to another domain, update `SITE_URL` in `lib/site.ts` (it feeds canonical URLs,
hreflang, `sitemap.xml` and `robots.txt`).

## License

[MIT](./LICENSE) © 2026 Ryanuo · Lab0x-Embedded
