# NADS 业务逻辑文档

> 本文档详细记录了 NADS 系统中各功能模块的完整业务逻辑、数据流转规则和算法细节。

---

## 目录

1. [数据模型与关系](#1-数据模型与关系)
2. [客户与项目管理](#2-客户与项目管理)
3. [智能排期引擎](#3-智能排期引擎)
4. [里程碑进度管理](#4-里程碑进度管理)
5. [合同收款管理](#5-合同收款管理)
6. [AI 合同解析](#6-ai-合同解析)
7. [AI 发票识别与对账](#7-ai-发票识别与对账)
8. [采购零件管理](#8-采购零件管理)
9. [Excel 导入导出](#9-excel-导入导出)
10. [发货单生成](#10-发货单生成)
11. [图纸工艺分析](#11-图纸工艺分析)
12. [待办事项与认证](#12-待办事项与认证)
13. [逾期预警算法](#13-逾期预警算法)

---

## 1. 数据模型与关系

### 核心实体关系

```
Client (客户) ──1:N──→ Project (项目)
                          ├──1:N──→ Device (设备) ──1:N──→ Part (零件)
                          ├──1:1──→ Contract (合同收款) ──1:N──→ Invoice (发票)
                          ├──1:N──→ Invoice (项目级发票)
                          └──1:N──→ Issue (问题记录)

Todo (待办事项) ── 独立模型
```

### Project 关键字段

| 字段 | 说明 |
|------|------|
| `contractNumber` | 合同编号 `GDyyyyMMddNN`（唯一） |
| `deliveryRaw` | 原始合同交期描述 |
| `deliveryType` | `natural` / `workday` / `absolute` |
| `deliveryDays` | 相对天数 |
| `deliveryTrigger` | `contract`(合同签订) / `downpayment`(首款到账) |
| `delivery` | 最终交货日期 |
| `isDeliveryManual` | 交期是否手动指定 |
| `designDaysPreset` / `purchaseDaysPreset` / `debugDaysPreset` | 各阶段预设工作日 |

### Device 字段模式

每个生产节点有三元组：`xxxEst`(预估日期) / `xxxAck`(确认时间) / `isXxxManual`(手动锁定标志)

8 个节点：design / standardPart / customPart / outsourcedPart / electricalPart / assembly / debug / shipment

### Part 类型与状态

- 类型：`standard` / `machined` / `outsourced` / `electrical`
- 状态流转：`pending` → `ordering`(已下单) → `received`(已到货)

---

## 2. 客户与项目管理

**源文件：** `src/app/actions/core.ts`

### 创建客户 (`createClient`)
使用 `upsert` 幂等操作——按 `name` 唯一键查找，存在则更新联系方式，不存在则新建。

### 创建项目 (`createProject`)
合同编号自动生成：`GD` + 日期 `yyyyMMdd` + 2位当日序号。查询当日最大序号后递增。

### 创建设备 (`createDevice`)
设备编号：`合同号-NN`（如 `GD2026031501-01`）。查询项目下最大流水号后递增。

---

## 3. 智能排期引擎

**源文件：** `src/app/actions/overview.ts` — `calculateEstimationsV2()`

### 算法原理（倒推 + 正推）

```
基准日 (首款到账/合同签订)
  └─→ 正推 designDays 工作日 ──→ 设计完成 (designEst)

交货期 (delivery)
  └─→ 即为调试出厂日 (debugEst)
       └─→ 倒推 debugDays 工作日 ──→ 总装完成 (assemblyEst)
            └─→ 倒推 1 工作日 ──→ 物料到位 (mfgEst)
                 ├─→ 标准件/机加工/外协/电气 均跟随 mfgEst
```

### 辅助函数
- `subtractWorkdays(date, days)` — 倒推 N 个工作日（跳过周末）
- `addDaysCustom(date, days, isWorkday)` — 正推 N 天，可选跳过周末

### 手动锁定机制
每个节点有 `isXxxManual` 标志，锁定后使用指定日期，不参与自动推演。

### 交期联动规则 (`updateProjectDelivery`)

| 场景 | 触发条件 | 行为 |
|------|---------|------|
| S | 选择"自动联动"模式 | 交期回归自动值，重置全部手动锁定 |
| A | 首款日变更 + downpayment触发 | 强制重算，重置全部手动锁定 |
| B | 手动开启交期锁定 | 使用指定日期 |
| C | 其他 | 比较传入值与自动值判定模式 |

**核心原则：** 自动模式下强制清空所有手动锁定，消除历史干扰。

更新时同步写入：Project 表 → Device.updateMany(8个节点+8个标志) → Contract 表(交期)。

---

## 4. 里程碑进度管理

**源文件：** `src/app/actions/overview.ts` — `toggleMilestone()`

### 切换规则
- 值为 `null` → 设为 `new Date()`（完成）
- 值非空 → 设为 `null`（取消）

### 依赖约束
- **发货必须先完成调试**（`shipmentAck` 要求 `debugAck` 非空）
- 其他工序可独立完成

### 联动写入
完成里程碑时同时更新对应的 `Est` 预估字段。发货确认时还更新 `Project.delivery` 和 `Contract.deliveryDate`。

---

## 5. 合同收款管理

**源文件：** `src/app/actions/contracts.ts`

### 聚合视图 (`getContracts`)
实时聚合 Project+Contract+Device 数据，合并独立合同行，统一排序并分配连续 `displaySeq`。

### 字段分流更新 (`updateContractField`)
系统智能将字段更新分流到不同表：

| 字段 | 目标 |
|------|------|
| `companyName` | `Client.name` |
| `contractNumber/Date/Amount` | `Project` 表 |
| `payAmount1/payTime1` | `Project.downPayment/downPaymentAckDate` |
| `shipDate` | 所有 `Device.shipmentAck` |
| `acceptanceDate/invoicedAmount/payAmount2~4` 等 | `Contract` 表 |

虚拟 ID（`virtual-` 前缀）会自动创建 Contract 记录。

### 删除逻辑
级联删除：Parts → Devices → Invoices → Contracts → Project。删除后重排 `seq`。

### 分期收款录入 (`addPaymentRecord`)
自动填充到下一个空槽位：downPayment → payAmount2 → payAmount3 → payAmount4。备注追加带日期前缀。

---

## 6. AI 合同解析

**源文件：** `src/app/api/parse-contract/route.ts`

### 三阶段管线

1. **内容提取：** PDF 先尝试文字层（Fast Track），字符 < 200 则走 VLM OCR (Qwen2.5-VL)；图片直接 OCR
2. **结构化提取：** DeepSeek-V3 将原始文本转为 JSON（客户名、付款方式、交期条款、设备清单）
3. **数据入库：** 类型校验 → Client upsert → 生成合同号 → 创建 Project + Devices

### 交期解析规则
- `natural`："30天" → `deliveryDays=30`
- `workday`："45个工作日" → `deliveryDays=45`
- `absolute`："2026年5月1日" → 解析为日期，支持省略年份补全

---

## 7. AI 发票识别与对账

**源文件：** `src/app/api/parse-invoice/route.ts`

### 识别管线
VLM OCR (Qwen2.5-VL) → DeepSeek-V3 结构化 → 类型校验（拒绝非发票）

### 自动对账算法
1. `buyerName` 模糊匹配 `Client`
2. 查找活跃项目：0个→冲突、1个→自动入账、>1个→返回候选列表
3. 自动入账：Contract 不存在则新建，已存在则 `invoicedAmount += amount`，创建 Invoice(status:"matched")

### 手动关联 (`/api/link-invoice`)
用户选择目标项目后，累加 invoicedAmount 并创建 Invoice(status:"manual")。

---

## 8. 采购零件管理

**源文件：** `src/app/actions/procurement.ts`

- 按 `type` 分四组返回：standard/machined/outsourced/electrical
- 状态自动流转：`isStocked=true` → received；`arrivalDate` 有值 → received；`issueDate` 有值 → ordering

---

## 9. Excel 导入导出

### 导入 (`/api/parse-excel`)
- Sheet 类型识别：Sheet名 → 文件名 → 列头内容，三级降级
- 列头定位：前 10 行查找含"名称"的行
- 覆盖导入：先 `deleteMany` 清空旧数据
- 日期解析：支持 Excel 序列号和文本格式

### 导出 (`/api/export-excel`)
ExcelJS 生成 4 Sheet（标准件/机加工/外协/电气），含样式列头、自动小计、蓝色合计行。

---

## 10. 发货单生成

**源文件：** `src/app/api/project/[id]/shipment-doc/route.ts`

筛选 `shipmentAck` 非空的设备 → docx 库生成 Word 文档（送货单标题、基本信息、设备明细表、签收行）→ 双文件名编码 (ASCII + UTF-8) 字节流返回。

---

## 11. 图纸工艺分析

**源文件：** `src/app/api/analyze-drawing/route.ts`

### 双引擎架构
1. **视觉提取：** Gemini Vision (降级轮询3个模型) → 兜底 NVIDIA Llama 3.2 Vision
2. **工序核算：** NVIDIA DeepSeek R1 → 兜底 Gemini
3. **费用结算：** `laborCost = Σ(hours × rate)`，持久化到 Part 表

---

## 12. 待办事项与认证

### 待办 (`src/app/actions/todo.ts`)
增删改查 + 完成状态切换，支持指定接收人 (`receiver`)。

### 认证 (`src/lib/auth.ts`)
Credentials Provider + JWT + bcrypt。中间件保护 `/dashboard/*` 和部分 API 路由。

---

## 13. 逾期预警算法

### 整体超期
项目未完结 + 交货期已过当前日期。

### 工序超期
排除已整体超期的项目后，检查任一设备的：设计/物料/总装/调试节点未完成且预估日已过。

### 进度百分比
5 阶段各 20%：设计 → 四物料全完成 → 总装 → 调试 → 发货。
