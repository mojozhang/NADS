# NADS 开发日志 (Development Log)

> 记录 NADS 系统从零到一的完整开发历程、技术决策与版本迭代细节。

---

## 📅 项目时间线

| 时间 | 版本 | 里程碑事件 |
|------|------|-----------|
| 2026-02 | V0.1.0 | 项目初始化，Create Next App 脚手架搭建 |
| 2026-02 | V0.2.x | 基础数据模型设计，Prisma + SQLite 集成 |
| 2026-02 | V0.3.x | NextAuth 认证系统接入，Credentials Provider |
| 2026-02 | V0.5.x | Dashboard 项目概览页面，设备里程碑进度条 |
| 2026-03 | V0.7.x | 核心排期算法实现（8节点正推/倒推引擎） |
| 2026-03 | V0.8.x | 发票智能识别与合同匹配逻辑 |
| 2026-03 | V0.9.7 | 发货单 Word 生成，字节流下载方案 |
| 2026-03 | V0.9.8 | 发货单关联 UI 增强，严苛校验逻辑 |

---

## 🔖 详细版本记录

### V0.9.8 — 发货单关联 UI 增强 (2026-03)

**变更内容：**
- 新增发货单关联页面，支持左侧预览与右侧项目详情核对的双栏交互模式
- 实现严苛的合同号与客户关键词匹配校验逻辑，防止误关联
- 里程碑标签字体统一 1.5x 缩放，视觉一致性优化

**技术决策：**
- 发货单关联采用完全匹配合同号 + 模糊匹配客户名称的双重校验策略
- 里程碑 UI 采用全局 `font-size` 缩放而非逐个调整像素值

---

### V0.9.7 — 发货单生成逻辑重构 (2026-03)

**变更内容：**
- 引入稳健的发货单 Word (.docx) 生成逻辑
- 采用 `NextResponse` + `Uint8Array` 字节流技术替代旧方案
- 实现双文件名编码策略：ASCII fallback + `filename*=UTF-8''` RFC 5987 标准
- 解决 Chrome 浏览器下中文文件名乱码及下载中断问题

**技术决策：**
- 放弃 `Blob` + `createObjectURL` 前端方案，改用服务端直接返回字节流
- 使用 `Content-Disposition` 双 filename 头保证跨浏览器兼容
- 添加 `Cache-Control: no-cache, no-store, must-revalidate` 防止缓存干扰
- 发货单只包含 `shipmentAck` 非空的设备记录（已确认发货）

**关键代码片段：**
```typescript
// 双文件名编码策略
const rawFileName = `shipment_order_${contractNumber}.docx`
const encodedFileName = encodeURIComponent(`发货单_${contractNumber}.docx`)

return new NextResponse(new Uint8Array(buffer), {
    headers: {
        'Content-Disposition': `attachment; filename="${rawFileName}"; filename*=UTF-8''${encodedFileName}`,
    }
})
```

---

### V0.8.x — 发票智能识别与对账 (2026-03)

**变更内容：**
- 实现发票 PDF/图片的 AI 双阶段解析管线
- 阶段一：使用 Qwen2.5-VL-7B 进行票面 OCR 提取
- 阶段二：使用 DeepSeek-V3 将 OCR 原始文本转化为结构化 JSON
- 实现自动对账逻辑：按购方名称查找客户 → 查找该客户活跃项目 → 单项目自动入账/多项目冲突检测
- 新增手动发票关联 API (`/api/link-invoice`)

**技术决策：**
- 采用两步 AI 管线（Vision OCR → Text Refinement）而非单步 VLM 端到端方案，原因是：
  1. OCR 和结构化提取分离，便于调试和定位问题
  2. 视觉模型 (Qwen2.5-VL) 的结构化输出不够稳定
  3. DeepSeek-V3 的 `response_format: json_object` 保证 JSON 格式可靠
- 文档类型校验前置：发票入口上传合同类文件时直接拒绝并提示切换模式

**对账匹配规则：**
1. 从 AI 返回结果中提取 `buyerName`
2. `prisma.client.findFirst({ where: { name: { contains: buyerName } } })` 模糊匹配客户
3. 查找该客户下所有 `status !== "archived"` 的活跃项目
4. 如果仅 1 个项目 → 自动关联并累加 `invoicedAmount`
5. 如果 > 1 个项目 → 返回 `collision: true` + 候选列表供用户选择

---

### V0.7.x — 核心排期算法引擎 (2026-03)

**变更内容：**
- 实现 `calculateEstimationsV2` 排期核心算法
- 支持 8 大生产节点的自动倒推/正推计算
- 实现节点级手动锁定/解锁（`isXxxManual` 标志位系统）
- 三种排期模式：自动联动 / 相对周期 / 固定日期
- 首款到账/合同签订两种基准触发器
- 工作日/自然日双日历类型

**技术决策：**
- 排期计算全部在服务端完成（Server Action），前端仅做实时预览
- 采用"倒推优先"策略：从交货期倒推调试/总装/物料节点，从基准日正推设计节点
- 引入手动锁定标志系统（8 个 `isXxxManual` Boolean），被锁定的节点不参与自动推演
- 当首款到账日变更或切换到自动模式时，强制重置所有手动锁定标志，消除历史干扰

**排期计算核心逻辑：**
```
交货期 (delivery) → 倒推 → 调试出厂 (debugEst)
                          → 倒推 debugDays 工作日 → 总装完成 (assemblyEst)
                          → 倒推 1 工作日 → 物料到位 (mfgEst)
                          → 4 个子项跟随 mfgEst (标准件/机加/外协/电气)
基准日 (baseDate) → 正推 designDays 工作日 → 设计完成 (designEst)
```

---

### V0.5.x — Dashboard 与里程碑进度 (2026-02)

**变更内容：**
- 实现项目概览 Dashboard 页面
- 4 张统计卡片：执行中 / 超期警告 / 工序超期 / 已归档
- 每设备独立的里程碑进度条（设计→物料组→总装→调试→发货）
- 点击圆点切换里程碑完成状态
- 逾期节点红色闪烁警告动画

**技术决策：**
- 进度条采用 5 等分计算（每阶段 20%），简洁直观
- 发货前强制检查调试已完成（`shipmentAck` 要求 `debugAck` 非空）
- 里程碑切换时自动同步写入对应的预估时间字段，实现"完成即记录"

---

### V0.3.x — 认证系统 (2026-02)

**变更内容：**
- 集成 NextAuth.js v4，使用 Credentials Provider
- 实现本地邮箱 + 密码登录（bcrypt 加密）
- 路由保护中间件（自动拦截 `/dashboard/*` 和 `/api/*` 路由）
- JWT 策略会话管理

**技术决策：**
- 选择 Credentials Provider 而非 OAuth，因为系统面向内部使用
- 保留默认测试账号 (`admin@example.com` / `123456`)，后续可删除
- 中间件仅保护关键路由，AI API 路由内部各自校验 session

---

### V0.2.x — 数据模型设计 (2026-02)

**变更内容：**
- 设计并实现 9 个核心数据模型
- 建立 Client → Project → Device → Part 的级联关系
- Project 与 Contract 一对一关系，Contract 与 Invoice 一对多关系
- 所有删除操作采用级联删除策略（`onDelete: Cascade`）

**技术决策：**
- 选择 SQLite 而非 PostgreSQL，原因是部署简单、无需额外数据库实例
- 合同号 (`contractNumber`) 设置 `@unique` 约束确保全局唯一
- Device 的 8 对 Est/Ack 字段设计：`xxxEst` 是预估日期，`xxxAck` 是确认日期
- Contract 表独立于 Project 表，支持"独立合同行"和"项目关联合同"两种模式

---

### V0.1.0 — 项目初始化 (2026-02)

**变更内容：**
- Create Next App 脚手架搭建
- 配置 Tailwind CSS + shadcn/ui 组件库
- 初始化 Prisma ORM + SQLite

---

## 🏗 技术架构决策记录 (ADR)

### ADR-001: 选择 SQLite 作为数据库

**背景：** 系统面向单企业内部使用，并发量有限。
**决策：** 使用 SQLite 文件型数据库，嵌入应用本体。
**优势：** 零运维成本、部署即用、备份仅需复制 `dev.db` 文件。
**风险：** 写并发能力有限，多用户同时编辑可能出现锁等待。

### ADR-002: AI 管线双阶段架构

**背景：** 需要从 PDF/图片中提取结构化数据（合同信息、发票信息）。
**决策：** 采用 Vision OCR (Qwen2.5-VL) + Text Refinement (DeepSeek-V3) 两步管线。
**优势：** 各阶段独立可调试，VLM 负责"看"，LLM 负责"理解"。
**替代方案：** 单步端到端 VLM（如 Gemini），但结构化输出不够稳定。

### ADR-003: Server Actions vs API Routes 的边界

**背景：** Next.js 14 同时支持 Server Actions 和 API Routes。
**决策：**
- **Server Actions：** 用于 CRUD 操作和业务逻辑（表单提交、状态切换）
- **API Routes：** 用于文件上传/下载（FormData）和需要返回二进制流的场景
**理由：** Server Actions 更简洁且自动处理 revalidation；API Routes 更适合处理 multipart/form-data 和自定义 HTTP 响应。

### ADR-004: 排期算法 "倒推 + 正推" 混合策略

**背景：** 8 个生产节点之间存在依赖约束。
**决策：** 从交货期倒推生产节点（调试→总装→物料），从基准日正推设计节点。
**优势：** 符合实际工期管理习惯——先确定交货期再反推工序时间节点。
**补充：** 手动锁定某节点后，该节点使用锁定值，其余节点基于新约束重算。

### ADR-005: 合同号自动生成策略

**背景：** 需要唯一且有规律的合同编号用于追踪和发货单打印。
**决策：** `GD` + 日期 `yyyyMMdd` + 2 位当日序号（如 `GD2026031501`）。
**冲突处理：** 查询当日最大序号后递增。

---

## 🔧 已知问题与待优化项

1. **合同号并发冲突：** 当前使用查询+递增方式生成合同号，极端并发下可能重复（概率极低，SQLite 单写者模式下不会发生）
2. **AI 引擎配额限制：** SiliconFlow 和 Gemini 均有速率限制，高频调用可能触发 429 错误
3. **Prisma `as any` 类型断言：** 部分 Prisma Client 查询使用了 `as any` 绕过类型检查，需在 schema 稳定后清理
4. **缺少自动化测试：** 当前无单元测试或集成测试覆盖
5. **图纸分析功能实验性：** 成本核算准确度依赖 AI 引擎质量，仅供参考
