# NADS 项目 Bug 检查报告

> 生成时间: 2026-03-20
> 检查范围: 数据结构一致性、唯一性约束、业务逻辑 Bug
> 注意: 本报告仅做检查，不包含任何代码修改

---

## 📋 问题汇总

| 优先级 | 类别 | 数量 | 严重程度 |
|:------:|------|:----:|:--------:|
| 🔴 | 数据库约束缺失 | 4 | 高 |
| 🔴 | 竞态条件 | 4 | 高 |
| 🟠 | 事务安全问题 | 2 | 中 |
| 🟠 | 静默错误吞没 | 3 | 中 |
| 🟡 | 类型安全绕过 | 59 处 | 低 |
| 🟡 | 硬编码凭证 | 1 | 低 |
| 🟡 | 调试代码残留 | 多处 | 低 |

---

## 🔴 高优先级问题

### 1. 缺失外键级联删除约束

**问题描述**: 关键外键关系缺少 `onDelete` 约束，删除父记录后子记录变成孤儿数据。

**位置**: `prisma/schema.prisma`

| 行号 | 当前代码 | 问题 |
|:----:|----------|------|
| 99 | `client Client @relation(fields: [clientId], references: [id])` | 删除 Client 后 Project 的 clientId 指向无效 |
| 205 | `project Project? @relation(fields: [projectId], references: [id])` | 删除 Project 后 Contract 成为孤立记录 |
| 220 | `contract Contract? @relation(fields: [contractId], references: [id])` | 删除 Contract 后 Invoice.contractId 指向无效 |
| 221 | `project Project? @relation(fields: [projectId], references: [id])` | 删除 Project 后 Invoice.projectId 指向无效 |

**对比**: 以下 5 个关系正确使用了 `onDelete: Cascade`:
- 行 37: `Account.userId → User`
- 行 47: `Session.userId → User`
- 行 137: `Device.projectId → Project`
- 行 169: `Part.deviceId → Device`
- 行 181: `Issue.projectId → Project`

**修复建议**:
```prisma
model Project {
  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)  // 添加 onDelete
  // ...
}

model Invoice {
  projectId  String?
  contractId String?
  project    Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)   // 添加
  contract   Contract? @relation(fields: [contractId], references: [id], onDelete: SetNull) // 添加
  // ...
}
```

---

### 2. 竞态条件 - 先查后插非原子操作

**问题描述**: 序号/编号在插入前通过查询计算，并发请求可能生成相同编号。

**核心问题**: 整个代码库搜索 `$transaction` 结果为 **0**，无任何事务保护。

#### 2.1 合同序号竞态

| 位置 | 问题代码 |
|------|---------|
| `src/app/actions/contracts.ts:192` | `const maxSeq = await db.contract.aggregate({ _max: { seq: true } })` |
| `src/app/actions/history.ts:113` | `const maxSeq = await db.contract.aggregate({ _max: { seq: true } })` |
| `src/app/api/link-invoice/route.ts:31` | `const maxSeq = await (prisma as any).contract.aggregate({ _max: { seq: true } })` |
| `src/app/api/parse-invoice/route.ts:178` | `const maxSeq = await (prisma as any).contract.aggregate({ _max: { seq: true } })` |

#### 2.2 合同号/设备号竞态

| 位置 | 问题代码 |
|------|---------|
| `src/app/actions/core.ts:40-57` | 先查询 `findMany` 再 `create`，并发时合同号重复 |
| `src/app/actions/core.ts:94-112` | 先查询 `findMany` 再 `create`，并发时设备号重复 |
| `src/app/api/parse-contract/route.ts:268-281` | 合同号预计算后插入，并发时重复 |

**修复建议**:
```typescript
// 使用原子操作
await prisma.$transaction(async (tx) => {
  const maxSeq = await tx.contract.aggregate({ _max: { seq: true } })
  const newSeq = (maxSeq._max.seq ?? 0) + 1
  return tx.contract.create({ data: { seq: newSeq, ... } })
})
```

---

## 🟠 中优先级问题

### 3. Excel 导入数据丢失风险

**位置**: `src/app/api/parse-excel/route.ts`

```typescript
// 第 45 行：先删除所有零件
await prisma.part.deleteMany({ where: { deviceId } })

// 第 197 行：然后批量创建 ← 无事务保护
await prisma.part.createMany({ data: partsToCreate })
```

**问题**: 如果 `createMany` 失败，所有零件数据永久丢失。

**修复建议**:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.part.deleteMany({ where: { deviceId } })
  await tx.part.createMany({ data: partsToCreate })
})
```

---

### 4. 发货单关联非原子操作

**位置**: `src/app/api/link-shipment/route.ts:32, 35-48`

```typescript
// 第 32 行：文件移动
await rename(tempPath, newFilePath)

// 第 35-48 行：两个独立的 DB 更新，无事务包装
await (prisma.project as any).update({ ... })
await prisma.device.updateMany({ ... })
```

**问题**: 如果 DB 更新失败，文件已被移动但数据库未记录，造成文件系统与数据库不一致。

**修复建议**:
```typescript
await prisma.$transaction(async (tx) => {
  await rename(tempPath, newFilePath)
  await tx.project.update({ ... })
  await tx.device.updateMany({ ... })
})
```

---

### 5. 静默吞没错误

| 位置 | 代码 | 问题 |
|------|------|------|
| `src/app/actions/overview.ts:503` | `catch (_) { /* 合同记录可能不存在，忽略 */ }` | 隐藏真正的数据不一致 |
| `src/app/actions/overview.ts:577` | `catch (_) { /* 忽略合同表不存在的情况 */ }` | 隐藏真正的数据不一致 |
| `src/app/api/analyze-drawing/route.ts:100` | `catch (err) { }` | 完全吞没错误，无日志 |

**修复建议**:
```typescript
catch (error: any) {
  console.error("操作失败:", error)
  // 至少记录日志，不要完全忽略
  throw error  // 或返回有意义的错误信息
}
```

---

## 🟡 低优先级问题

### 6. 类型安全绕过

**问题描述**: 整个代码库有 **59 处** `as any` 类型断言，严重绕过 TypeScript 类型检查。

**分布统计**:

| 文件 | 数量 |
|------|:----:|
| `src/app/actions/overview.ts` | 14 |
| `src/app/actions/contracts.ts` | 10 |
| `src/app/actions/procurement.ts` | 7 |
| `src/app/api/parse-invoice/route.ts` | 6 |
| `src/app/actions/history.ts` | 5 |
| `src/app/api/link-invoice/route.ts` | 5 |
| `src/app/api/export-excel/route.ts` | 4 |
| 其他文件 | 8 |

**典型问题代码**:
```typescript
// contracts.ts:7-8
const db = prisma as any  // 绕过 Prisma 类型缓存问题
```

---

### 7. 硬编码测试凭证

**位置**: `src/lib/auth.ts:30-34`

```typescript
if (credentials.email === "admin@example.com" && credentials.password === "123456") {
  // 预留的写死账户方便测试登录，等第一版过了可以去掉
  const mockUser = { id: "1", name: "Administrator", ... }
  return mockUser
}
```

**安全风险**: 生产代码中存在硬编码凭证。

---

### 8. 调试代码残留

**位置**: 多个 shipment-doc 相关文件

```typescript
const logPath = "/tmp/nads_debug.log";
const log = (msg: string) => appendFileSync(logPath, `${new Date().toISOString()} - ${msg}\n`, { flag: 'a' });
```

**问题**: 生产环境中不应有调试日志写入 `/tmp` 目录。

---

## 📊 详细问题清单

| # | 问题类型 | 位置 | 优先级 | 状态 |
|:--:|----------|------|:------:|:----:|
| 1 | 缺失 onDelete (Project.clientId) | schema.prisma:99 | 🔴 | 待修复 |
| 2 | 缺失 onDelete (Contract.projectId) | schema.prisma:205 | 🔴 | 待修复 |
| 3 | 缺失 onDelete (Invoice.projectId) | schema.prisma:221 | 🔴 | 待修复 |
| 4 | 缺失 onDelete (Invoice.contractId) | schema.prisma:220 | 🔴 | 待修复 |
| 5 | 竞态条件 (contracts.ts) | actions/contracts.ts:192 | 🔴 | 待修复 |
| 6 | 竞态条件 (history.ts) | actions/history.ts:113 | 🔴 | 待修复 |
| 7 | 竞态条件 (link-invoice) | api/link-invoice/route.ts:31 | 🔴 | 待修复 |
| 8 | 竞态条件 (parse-invoice) | api/parse-invoice/route.ts:178 | 🔴 | 待修复 |
| 9 | Excel 导入无事务 | api/parse-excel/route.ts:45-197 | 🟠 | 待修复 |
| 10 | 发货单关联非原子 | api/link-shipment/route.ts:32-48 | 🟠 | 待修复 |
| 11 | 静默吞没错误 | actions/overview.ts:503 | 🟠 | 待修复 |
| 12 | 静默吞没错误 | actions/overview.ts:577 | 🟠 | 待修复 |
| 13 | 空 catch 块 | api/analyze-drawing/route.ts:100 | 🟠 | 待修复 |
| 14 | 类型安全绕过 (59处) | 12个文件 | 🟡 | 待修复 |
| 15 | 硬编码凭证 | lib/auth.ts:30-34 | 🟡 | 待修复 |
| 16 | 调试代码残留 | 多处 | 🟡 | 待修复 |

---

## 🔧 修复优先级建议

### Phase 1 - 数据完整性 (必须修复)
1. 添加缺失的 4 个 `onDelete` 约束
2. 为所有序号生成逻辑添加 `$transaction` 事务保护

### Phase 2 - 业务逻辑安全
3. 为 Excel 导入添加事务包装
4. 为发货单关联添加事务包装
5. 修复静默吞没的错误处理

### Phase 3 - 代码质量
6. 移除或减少 `as any` 类型断言
7. 移除硬编码凭证
8. 清理调试代码

---

## 📝 检查方法说明

本次检查使用了以下方法:
- Prisma Schema 分析 (`prisma/schema.prisma`)
- 代码搜索 (`grep` 搜索 `$transaction`, `as any`, `catch` 等模式)
- Server Actions 审查 (`src/app/actions/`)
- API Routes 审查 (`src/app/api/`)
- 错误处理模式分析
- 业务逻辑流程分析

---

*报告生成工具: NADS Bug Checker*
