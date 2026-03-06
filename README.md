# NADS 合同与采购管理系统

NADS 是一套基于 **Next.js 14 (App Router)** + **Supabase** 构建的现代化合同订单与设备采购智能管理平台。系统支持完整的项目生命周期管理，涵盖合同录入、智能排期联动、采购设备追踪、发票识别匹配以及收款进度管理等核心模块。

## 🎯 核心功能特性

* **合同与项目管理**：支持设备销售合同的录入，自动按设备品类进行拆解与批次管理。
* **智能排期推演与微调**：内置强大的排期算法，由核心基准日（首款到账日、约定出厂日、相对交付周期）自动正反推算 8 大生产节点（设计、物料加工、装配、发货等）。并支持可视化地局部手工微调。
* **采购进度追踪**：对所关联设备的“BOM”与采购明细清单进行管理。
* **发票智能识别与匹配**：提供发票上传入口，可智能提取金额等票面信息，并与同公司的既有往来设备清单建立绑定对账关系。
* **逾期预警看板**：Dashboard 面板提供基于算法得出的交付超期、生产节点滞后警告，以及全局项目执行看板。

## 🛠 技术栈

* **框架**: [Next.js 14](https://nextjs.org/) (App Router, TSX)
* **样式**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
* **后端引擎/BaaS**: [Supabase](https://supabase.com/) (含 PostgreSQL, Authentication OAuth)
* **数据库 ORM**: [Prisma](https://www.prisma.io/)
* **语言**: TypeScript

## 🚀 快速启动

### 1. 环境准备
- Node.js 及 npm / bun
- Python 3.11 (针对部分后续接入的 AI 及解析脚本)
- 获取一份针对您本地 Supabase 实例的 `.env.local` 环境变量文件。

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
复制 `.env.local.example` 为 `.env.local` 并填入相应的 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 等认证信息。

### 4. 运行本地开发服务器
```bash
npm run dev
```

打开浏览器并访问 [http://localhost:8888](http://localhost:8888) 即可进入您的开发测试界面。

## 📁 核心目录结构
```text
nads-client/
├── prisma/               # Prisma schema 数据模型配置
├── src/
│   ├── app/              # Next.js App Router 路由组与主要页面
│   │   ├── actions/      # 服务器端操作逻辑 (Server Actions - 包含排期推演逻辑 overview.ts)
│   │   ├── api/          # 供三方解析或 Webhook 使用的常规 API Routes
│   │   ├── dashboard/    # 项目概览、排期面板、逾期报警页面
│   │   └── procurement/  # 采购下级清单详情功能
│   ├── components/       # 全局复用的 UI 组件库 (含 shadcn 块与授权组件)
│   └── lib/              # Supabase Client 与 Prisma 实例等核心工具类
└── package.json
```

## 🔒 规范与约束

- **认证**: 仅使用 Supabase OAuth 进行系统访问鉴权。后端通讯使用安全的 Service Role。
- **状态联动**: 核心排期计算遵循“顶部日期锁定 -> 整体节点重推 -> 手工介入局部”的全链路更新策略。

---

> 为设备生产全流转提供直观、准确的智能化管理抓手。
