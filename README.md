# 🏭 NADS — 非标自动化设备合同与采购智能管理系统

> **Non-standard Automation Device System**
> 为设备制造全流程提供直观、准确的智能化管理抓手

![NADS Overview](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![Version](https://img.shields.io/badge/Version-V0.9.8+-blue) ![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black)

## 📖 项目概况

NADS 是一套专门面向**非标自动化设备制造企业**定制的一体化业务管理平台，覆盖从合同签订到发货交付的全生命周期管理。

### 痛点与解决方案

| 传统痛点 | NADS 智能化方案 |
|---------|-----------|
| 合同信息录入繁琐、容易出错 | **AI 智能解析** PDF/图片，提取信息一键建项 |
| 生产排期靠 Excel、经常超期 | **智能排期引擎**，8 生产节点自动正推/倒推推演并实时预警 |
| 发票对账耗时长、易漏单 | **AI OCR 发票识别**，自动匹配购方并一键绑定系统项目入账 |
| 采购进度追踪混乱 | **标准化流程 + Excel 导入导出**追踪标准件、机加工等四类物料 |

---

## 🎯 核心功能特性

### 1. 🤖 AI 智能引擎
集成了硅基流动 (Qwen2.5-VL-7B)、DeepSeek-V3 和 Google Gemini Vision，提供业界领先的文档解析能力：
- **AI 合同解析**：上传合同 PDF/图片，自动提取客户、合同金额、设备明细与交期条款，自动拆解设备并分配项目号。
- **AI 发票对账**：上传发票图像，系统通过 OCR 与结构化处理提取发票核心数据，自动去数据库查找匹配项目并记录收款。
- **AI 图纸分析**（实验性）：机器解读机加工图纸，进行工序拆解与成本估算。

### 2. ⏰ 智能排期推演与调整
- **8 节点精确控制**：涵盖设计、标准件、机加工、外协、电气、总装、调试、发货八大核心节点。
- **双向推演算法**：支持根据交货期**倒推**制造节点，或根据起算日**正推**。
- **手动微调锁定**：支持单个节点锁定，其余节点自动重算。

### 3. 📄 自动化文档生成
- **发货单生成**：自动根据设备出厂状态，通过 `docx` 库生成标准格式的 Word 文件，提供浏览器原生的字节流下载机制，完美支持中文文件名 (`RFC 5987`)。

### 4. 💰 收款与进度看板
- 仪表盘汇总执行中、超期、工序滞好等预警卡片。
- 支持 4 期分期付款管理及动态入账情况追踪。
- 项目状态流转与归档机制。

---

## 🛠 技术架构

| 层级 | 技术与库 |
|------|------|
| **前端框架** | Next.js 14 App Router (React 18 + TypeScript) |
| **UI 与样式** | Tailwind CSS + shadcn/ui + Lucide Icons |
| **状态/服务端**| React Server Actions + API Routes |
| **数据库** | SQLite (本地零运维部署) |
| **ORM** | Prisma v6.x |
| **认证系统** | NextAuth.js (Credentials + JWT 策略) |
| **文档处理** | `docx` (Word 生成), `SheetJS` (Excel 导入), `ExcelJS` (Excel 导出), `pdf.js` |

> 考虑到系统在单企业内网环境、并发受限的场景，采用 SQLite 单文件部署，使得交付零运维。

---

## 🚀 快速启动

**前置环境：** Node.js ≥ 18.x

1. **进入应用目录并安装依赖**
   ```bash
   cd nads-client
   npm install
   ```

2. **配置环境变量**
   ```bash
   cp .env.local.example .env.local
   ```
   *需在 `.env.local` 填入 `NEXTAUTH_SECRET`、`DATABASE_URL`以及相关的 AI 平台通信密钥（如 `SILICONFLOW_API_KEY`）*。

3. **初始化本地数据库**
   ```bash
   npx prisma db push
   ```

4. **启动服务**
   ```bash
   npm run dev
   ```
   **访问地址**: [http://localhost:8888](http://localhost:8888)  
   **默认测试账号**: `admin@example.com` / `123456`

---

## 📂 核心目录结构

```text
NADS/
├── nads-client/               # 核心系统应用
│   ├── prisma/                # ORM 数据模型 (9 个核心表)
│   ├── src/
│   │   ├── app/
│   │   │   ├── actions/       # 业务逻辑 (Server Actions)
│   │   │   ├── api/           # API 端点 (AI、上传、导出等)
│   │   │   └── dashboard/     # 仪表盘与核心前端页面
│   │   ├── components/        # UI 与业务组件
│   │   └── lib/               # 工具函数、Prisma client 与 Auth 策略
│   └── package.json
└── NADS_项目全览与开发日志.md   # 最详细的设计图、开发里程碑与排期算法记录
```

> **进阶开发者**：请参阅 [`NADS_项目全览与开发日志.md`](./NADS_项目全览与开发日志.md) 以获取完整的 ER 关系图、架构图、算法工作流和深度 ADR (架构决断) 记录。

---

## 📜 许可证

本项目为内部专有系统，未经授权限制分发与商用。
结合 Vibe Coding 理念实现从零到一的快速孵化与迭代部署。
