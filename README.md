# EmbedKit · 嵌入式工具箱

面向嵌入式开发的在线工具集：寄存器位域、字节流、校验算法、协议帧、云平台参数。
**所有计算都在浏览器本地完成，输入内容不上传服务器。**

[English](#english) · [技术栈](#技术栈) · [本地开发](#本地开发) · [约定](#约定) · [路线图](#路线图)

## 工具清单

| 状态 | 工具 | 说明 |
| --- | --- | --- |
| ✅ 可用 | **进制转换** `/tools/base-converter` | 2 / 8 / 10 / 16 互转，BigInt 大数、位宽补码解释、大小端字节序视图 |
| 🚧 规划中 | CRC 计算器 | 通用参数模型（poly / init / refin / refout / xorout）与常用预设 |
| 🚧 规划中 | 位域 / 寄存器可视化 | 逐位查看、置位 / 清零 / 取反，导出 C 宏 |
| 🚧 规划中 | HEX ↔ ASCII / C 数组 | 十六进制与文本互转，生成可回读的 `uint8_t` 数组 |
| 🚧 规划中 | Modbus 报文生成与校验 | RTU（CRC16）与 TCP（MBAP）读写寄存器 / 线圈 |
| 🚧 规划中 | OneNET MQTT 参数生成 | ClientID / Username / Password 签名与物模型 Topic |

> 规划中的工具在首页是**灰色禁用卡片**，不做假入口 —— 实现可用后才点亮。

## 技术栈

Next.js 16（App Router / Turbopack）· React 19 · TypeScript ·
Tailwind CSS v4 · shadcn/ui（radix-nova 预设）· next-intl（中英双语）·
next-themes · Vitest · pnpm · ESLint（@antfu/eslint-config）

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:3000 → 自动跳 /zh
```

质量闸门（提交前跑齐四条）：

```bash
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest（工具核心纯函数）
pnpm build          # next build，产出静态页
```

## 目录结构

```
app/[locale]/               页面（Server Component，只做取文案与布局）
  page.tsx                  首页：分类 + 工具卡片（含禁用态）
  tools/<slug>/page.tsx     工具页外壳
components/
  ui/                       shadcn 生成的原语
  layout/                   页头 / 页脚 / 语言切换 / 主题切换
  tools/<slug>/             工具的交互壳（'use client'，只做状态与渲染）
lib/
  tools-meta.ts             工具清单单一数据源（首页、分类、卡片全由它派生）
  core/*.ts                 工具算法：纯函数 + 同名单测
i18n/                       next-intl 路由 / 请求配置
messages/{zh,en}.json       文案
```

## 约定

1. **算法与 UI 分离**：`lib/core/*.ts` 不许 import React、不许碰 DOM，全部可单测；
   UI 只负责状态、渲染和复制。
2. **加一个工具 = 四处改动**：`lib/tools-meta.ts` 加一条 → `messages/*.json` 加文案 →
   `lib/core/<name>.ts` + 单测 → `components/tools/<slug>/` + `app/[locale]/tools/<slug>/page.tsx`。
3. **不做假入口**：没实现的工具在首页保持灰色禁用卡片并标注「规划中」，
   而不是给一个点了报错的按钮。
4. **纯本地计算**：工具页不发任何请求；敏感输入（密钥等）只留在内存里。

## 路线图

- v0.1 进制转换（骨架已完成：i18n、设计系统、纯函数 + 单测 40 条）
- v0.2 CRC 计算器、位域 / 寄存器可视化、HEX ↔ ASCII / C 数组
- v0.3 Modbus 报文、OneNET MQTT 三元组、IEEE 754 浮点解析、STM32 定时器 / 波特率计算
- v0.4 串口监视器（Web Serial API，Chromium 桌面）、CAN 报文解析

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

Conventions: algorithms live in `lib/core/*.ts` as pure functions with unit tests;
UI components only handle state and rendering. Unimplemented tools are shown as
grey, disabled cards instead of fake entries. The tool list has a single source of
truth in `lib/tools-meta.ts`.

Deploy: import this repo on Vercel — it is a plain Next.js app, no environment
variables and no backend required.

## License

[MIT](./LICENSE) © 2026 Ryanuo · Lab0x-Embedded
