# NADS — 非标自动化设备合同与采购智能管理系统

<p align="center">
  <strong>为设备制造全流程提供直观、准确的智能化管理抓手</strong>
</p>

---

## 📖 项目简介

**NADS**（Non-standard Automation Device System）是一套面向**非标自动化设备制造企业**的一体化业务管理平台。系统基于 **Next.js 14 (App Router)** + **Prisma ORM** + **SQLite** 全栈架构构建，涵盖合同订单录入、AI 智能解析、生产排期推演、采购物料追踪、发票 OCR 识别与自动对账、发货单自动生成、收款进度看板等核心业务模块。

系统集成了多种 AI 引擎（硅基流动 SiliconFlow / Google Gemini / NVIDIA DeepSeek），实现了合同文本智能提取、发票票面 OCR 识别、机加工图纸工艺分析与成本核算等前沿 AI 功能。

---

## 🎯 核心功能特性

### 📋 合同与项目管理
- 支持手动创建或 **AI 智能解析合同 PDF/图片**，自动提取客户名称、合同金额、交期条款、设备清单等结构化信息一键建项
- 自动合同编号生成规则：`GD` + 日期 `yyyyMMdd` + 2 位当日序号
- 自动按设备品类进行项目拆解，每台设备分配唯一设备编号（`合同号-序号`）

### ⏰ 智能排期推演与微调
- 内置强大的排期引擎，支持 **正推 + 倒推** 双向计算 **8 大生产节点**：
  - 设计完成 → 标准件到位 → 机加工到位 → 外协到位 → 电气到位 → 总装完成 → 调试出厂 → 发货
- 三种排期模式：
  - **自动联动**：基于合同交期条款（首款到账/合同签订起算）自动推算
  - **相对周期**：手动设定天数 + 日历类型（自然日/工作日）
  - **固定日期**：直接指定约定交货日期
- **节点级手动微调**：支持锁定单个节点日期，其余节点自动重算
- **逾期预警看板**：实时识别项目整体超期与工序节点滞后

### 🛒 采购进度追踪
- 四大物料分类管理：**标准件、机加工件、外协件、电气件**
- 支持 **Excel 批量导入**（自动识别 Sheet 名称/列头映射）与 **Excel 导出**
- 逐条维护供应商、单价、下单/到货日期、入库状态、物流追踪等信息

### 🧾 发票智能识别与对账
- 上传 PDF/图片发票 → **AI 双阶段管线**（VLM OCR 提取 + DeepSeek 结构化）→ 自动识别发票号、金额、购方名称
- 自动查找对应客户 → **单项目自动入账** / 多项目冲突检测，支持手动关联
- 文档类型校验：自动区分发票/合同/其他类型，防止误传

### 📄 发货单自动生成
- 一键生成标准格式的 Word (.docx) 发货单
- 自动筛选已确认发货的设备，按合同编号命名，支持中文文件名

### 💰 合同收款管理
- 支持最多 4 期分期付款记录（首付款 + 3 期后续款项）
- 百分比/金额双模式预付款录入
- 已开票金额累计与对账
- 项目归档/取消归档管理

### 🤖 图纸工艺分析（实验性功能）
- 上传机加工图纸 → **Gemini Vision 提取加工特征** → **DeepSeek R1 工序拆解与成本核算**
- 自动估算材料费、各工序工时及加工费用

### 📝 待办事项
- 侧边栏便签式待办管理，支持添加/编辑/完成/删除/指定接收人

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript) |
| **样式** | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (Radix UI) |
| **认证** | [NextAuth.js](https://next-auth.js.org/) (Credentials Provider, JWT 策略) |
| **数据库** | [SQLite](https://www.sqlite.org/) (本地文件 `dev.db`) |
| **ORM** | [Prisma](https://www.prisma.io/) (v6.x) |
| **AI — 合同/发票解析** | [硅基流动 SiliconFlow](https://siliconflow.cn/) (Qwen2.5-VL-7B OCR + DeepSeek-V3 结构化) |
| **AI — 图纸分析** | [Google Gemini](https://ai.google.dev/) (Vision) + [NVIDIA DeepSeek R1](https://build.nvidia.com/) (推理) |
| **文档生成** | [docx](https://docx.js.org/) (Word) / [ExcelJS](https://github.com/exceljs/exceljs) (Excel) |
| **Excel 解析** | [SheetJS (xlsx)](https://sheetjs.com/) |
| **PDF 处理** | [pdfjs-dist](https://mozilla.github.io/pdf.js/) + [node-canvas](https://github.com/Automattic/node-canvas) |
| **日期处理** | [date-fns](https://date-fns.org/) + date-fns-tz |

---

## 🚀 快速启动

### 1. 环境准备

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x

### 2. 克隆并安装依赖

```bash
git clone <repository-url>
cd nads-client
npm install
```

### 3. 配置环境变量

复制示例文件并填入实际值：

```bash
cp .env.local.example .env.local
```

`.env.local` 所需变量：

| 变量名 | 说明 | 必需 |
|--------|------|:----:|
| `NEXTAUTH_URL` | 应用访问地址，如 `http://localhost:8888` | ✅ |
| `NEXTAUTH_SECRET` | NextAuth 加密密钥（随机长字符串） | ✅ |
| `DATABASE_URL` | SQLite 数据库路径，默认 `file:./dev.db` | ✅ |
| `SILICONFLOW_API_KEY` | 硅基流动 API 密钥（合同/发票解析） | ⭐ |
| `SILICONFLOW_BASE_URL` | 硅基流动 API 地址 | ⭐ |
| `GEMINI_API_KEY` | Google Gemini API 密钥（图纸分析） | ⬜ |
| `NVIDIA_API_KEY` | NVIDIA API 密钥（DeepSeek R1 推理引擎） | ⬜ |

> ✅ 必需 / ⭐ AI 功能必需 / ⬜ 可选（图纸分析功能）

### 4. 初始化数据库

```bash
npx prisma db push
```

### 5. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 [http://localhost:8888](http://localhost:8888)。

**默认测试账号**: `admin@example.com` / `123456`

---

## 📁 项目目录结构

```text
nads-client/
├── prisma/
│   └── schema.prisma            # 数据模型定义（9 个核心模型）
├── src/
│   ├── app/
│   │   ├── (auth)/              # 认证相关路由组
│   │   ├── login/               # 登录页面
│   │   ├── actions/             # Server Actions（6 个业务逻辑模块）
│   │   │   ├── core.ts          # 客户/项目/设备 CRUD
│   │   │   ├── contracts.ts     # 合同收款管理（聚合视图、字段分流更新）
│   │   │   ├── overview.ts      # 排期引擎、里程碑切换、项目归档/删除
│   │   │   ├── procurement.ts   # 采购零件 CRUD
│   │   │   ├── history.ts       # 操作历史聚合、分期收款录入
│   │   │   └── todo.ts          # 待办事项 CRUD
│   │   ├── api/                 # API Routes（13 个独立端点）
│   │   │   ├── auth/            # NextAuth 认证回调
│   │   │   ├── parse-contract/  # AI 合同解析（PDF/图片 → 结构化 JSON → 自动建项）
│   │   │   ├── parse-invoice/   # AI 发票识别（OCR → 自动对账入库）
│   │   │   ├── link-invoice/    # 手动发票关联
│   │   │   ├── parse-excel/     # Excel 采购清单导入
│   │   │   ├── export-excel/    # 采购清单 Excel 导出
│   │   │   ├── export-template/ # 采购清单 Excel 模板下载
│   │   │   ├── analyze-drawing/ # 图纸工艺分析与成本核算
│   │   │   ├── project/[id]/shipment-doc/  # 项目级发货单 Word 生成
│   │   │   ├── device/[id]/shipment-doc/   # 设备级发货单 Word 生成
│   │   │   ├── link-shipment/   # 发货单关联
│   │   │   ├── parse-shipment/  # 发货单解析
│   │   │   └── projects/active/ # 活跃项目列表查询
│   │   ├── dashboard/           # 主应用页面
│   │   │   ├── page.tsx         # 项目概览与排期进度看板（核心页面）
│   │   │   ├── layout.tsx       # 侧边栏布局（导航 + 待办便签）
│   │   │   ├── contracts/       # 信息上传（合同/发票 AI 解析入口）
│   │   │   ├── contracts-table/ # 合同收款管理表格
│   │   │   └── project/[projectId]/ # 项目详情子页面
│   │   └── procurement/         # 采购管理
│   │       └── device/[deviceId]/ # 设备级采购清单详情
│   ├── components/
│   │   ├── auth/                # 认证组件（AuthProvider、SignOutButton）
│   │   ├── dashboard/           # 仪表盘组件（TodoPanel）
│   │   ├── layout/              # 布局组件
│   │   └── ui/                  # shadcn/ui 基础组件库
│   ├── lib/
│   │   ├── auth.ts              # NextAuth 配置（Credentials Provider）
│   │   ├── prisma/client.ts     # Prisma Client 单例
│   │   └── utils.ts             # 工具函数
│   ├── middleware.ts            # 路由保护中间件
│   └── types/                   # TypeScript 类型定义
├── public/                      # 静态资源（Logo 等）
├── .env                         # 基础环境变量
├── .env.local                   # 本地环境变量（不提交）
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🗄 数据模型概览

系统包含 **9 个核心数据模型**，使用 SQLite 存储：

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| **User** | 系统用户 | email (唯一), password (bcrypt), role |
| **Client** | 客户（公司） | name (唯一), contact, phone |
| **Project** | 项目（合同订单） | contractNumber (唯一), 交期相关字段组, 排期预设参数 |
| **Device** | 设备 | deviceNumber (唯一), 8 个预估时间 + 8 个确认时间 + 8 个手动锁定标志 |
| **Part** | 零件/物料 | type (standard/machined/outsourced/electrical), 采购流转状态 |
| **Contract** | 合同收款记录 | 4 期付款 (payAmount1~4 + payTime1~4), invoicedAmount |
| **Invoice** | 发票凭证 | invoiceNumber, amount, buyerName, status |
| **Issue** | 问题记录 | title, description, kbSummary, status |
| **Todo** | 待办事项 | content, receiver, completed |

### 核心关系

```text
Client 1:N → Project 1:N → Device 1:N → Part
                      1:1 → Contract 1:N → Invoice
                      1:N → Invoice（项目级关联）
                      1:N → Issue
```

---

## 📌 版本迭代历史

| 版本 | 里程碑 |
|------|--------|
| **V0.9.8** | 增强发货单关联 UI，左侧预览 + 右侧项目详情核对；严苛合同号与客户名校验逻辑 |
| **V0.9.7** | 稳健的发货单生成逻辑，采用 `NextResponse` 字节流技术解决 Chrome 文件名乱码问题 |
| **V0.8.x** | 完善发票智能识别与合同匹配逻辑 |
| **V0.7.x** | 实现核心排期算法的 8 个生产节点自动推演与手动调整功能 |
| **V0.1.0** | 项目初始化，基础框架搭建 |

---

## 📜 许可

> 内部项目，仅限授权使用。

---

> *NADS — 为设备生产全流转提供直观、准确的智能化管理抓手。*
