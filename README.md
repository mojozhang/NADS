# NADS 合同与采购管理系统

NADS 是一套基于 **Next.js 14 (App Router)** + **SQLite** 构建的现代化合同订单与设备采购智能管理平台。系统支持完整的项目生命周期管理，涵盖合同录入、智能排期联动、采购设备追踪、发票识别匹配以及收款进度管理等核心模块。

## 🎯 核心功能特性

* **合同与项目管理**：支持设备销售合同的录入，自动按设备品类进行拆解与批次管理。
* **智能排期推演与微调**：内置强大的排期算法，由核心基准日（首款到账日、约定出厂日、相对交付周期）自动正反推算 8 大生产节点（设计、物料加工、装配、发货等）。并支持可视化地局部手工微调。
* **采购进度追踪**：对所关联设备的“BOM”与采购明细清单进行管理。
* **发票智能识别与匹配**：提供发票上传入口，可智能提取金额等票面信息，并与同公司的既有往来设备清单建立绑定对账关系。
* **发货单自动生成 (New)**：支持基于项目或设备的一键发货单 Word (.docx) 生成。系统会自动筛选已确认发货的设备，并按照标准格式输出，极大提高了行政办公效率。
* **逾期预警看板**：Dashboard 面板提供基于算法得出的交付超期、生产节点滞后警告，以及全局项目执行看板。

## 🛠 技术栈

* **框架**: [Next.js 14](https://nextjs.org/) (App Router, TSX)
* **样式**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
* **认证**: [NextAuth.js](https://next-auth.js.org/) (凭借本地凭证登录)
* **数据库/ORM**: [Prisma](https://www.prisma.io/) + 本地 **SQLite** (`dev.db`)
* **文档处理**: [docx](https://docx.js.org/) 库用于高效生成 Word 文档。

## 🚀 快速启动

### 1. 环境准备
- Node.js 及 npm / bun
- 获取一份 `.env.local` 环境变量文件（主要包含 `NEXTAUTH_SECRET` 及本地 SQLite 的 `DATABASE_URL` 配置）。

### 2. 安装依赖
```bash
npm install
```

### 3. 配置数据库
```bash
npx prisma db push
```

### 4. 运行本地开发服务器
```bash
npm run dev -p 8888
```

打开浏览器并访问 [http://localhost:8888](http://localhost:8888) 即可进入您的开发测试界面。

## 📁 核心目录结构
```text
nads-client/
├── prisma/               # Prisma schema 数据模型配置
├── src/
│   ├── app/              # Next.js App Router 路由组与主要页面
│   │   ├── actions/      # 服务器端操作逻辑
│   │   ├── api/          # 常规 API Routes (包含发货单生成 /project/[id]/shipment-doc)
│   │   ├── dashboard/    # 项目概览、排期面板、逾期报警页面
│   │   └── procurement/  # 采购下级清单详情功能
│   ├── components/       # 全局复用的 UI 组件库
│   └── lib/              # Prisma 实例与核心工具类
└── package.json
```

## � 版本迭代历史

- **V0.9.8**: 增强了发货单关联 UI，支持单据左侧预览与右侧项目详情核对；支持完全匹配合同号与客户关键词的严苛校验逻辑。
- **V0.9.7**: 引入了极其稳健的发货单生成逻辑，采用 `NextResponse` 字节流技术，完美解决 Chrome 下的文件名乱码及下载中断问题。
- **V0.8.x**: 完善了发票智能识别与合同匹配逻辑。
- **V0.7.x**: 实现了核心排期算法的 8 个生产节点自动推演与手动调整功能。

---

> 为设备生产全流转提供直观、准确的智能化管理抓手。
