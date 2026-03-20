"use server"

import prisma from "@/lib/prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Prisma Client 类型缓存可能未更新，用 as any 绕过
const db = prisma as any

/**
 * 获取全部合同收款记录（实时聚合视图）
 */
export async function getContracts() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        // 1. 获取所有项目及其关联合同
        const projects = await db.project.findMany({
            include: {
                client: true,
                devices: true,
                contract: true
            },
            orderBy: { createdAt: "desc" }
        })

        // 2. 获取所有 未关联项目 的合同（手动创建的行）
        const standaloneContracts = await db.contract.findMany({
            where: { projectId: null },
            orderBy: { createdAt: "desc" }
        })

        // 3. 组装项目驱动的视图模型
        const projectModels = projects.map((p: any) => {
            const contract = p.contract || {} as any
            const deviceList = (p.devices || []).map((d: any) => {
                const countStr = d.quantity && d.quantity > 1 ? ` x${d.quantity}` : ''
                return `${d.category || ''}${countStr}`
            }).filter(Boolean).join('、') || p.name

            return {
                id: contract.id || `virtual-${p.id}`,
                projectId: p.id,
                seq: contract.seq || 0,
                contractNumber: p.contractNumber,
                companyName: p.client?.name || "",
                projectName: deviceList,
                contractDate: p.contractSignDate,
                paymentMethod: p.paymentTerm,
                deliveryDate: p.delivery,
                acceptanceDate: contract.acceptanceDate,
                shipmentAck: (p.devices || []).every((d: any) => d.shipmentAck) ? (p.devices[0]?.shipmentAck || null) : null,
                contractAmount: p.amount || 0,
                invoicedAmount: contract.invoicedAmount || 0,
                completed: contract.completed || false,
                paymentRemark: contract.paymentRemark,
                payTime1: (p.downPaymentAckDate && !isNaN(new Date(p.downPaymentAckDate).getTime()))
                    ? new Date(p.downPaymentAckDate).toISOString().split('T')[0]
                    : null,
                payAmount1: p.downPayment || 0,
                payTime2: contract.payTime2,
                payAmount2: contract.payAmount2 || 0,
                payTime3: contract.payTime3,
                payAmount3: contract.payAmount3 || 0,
                payTime4: contract.payTime4,
                payAmount4: contract.payAmount4 || 0,
                paymentNote: contract.paymentNote,
                remark1: contract.remark1,
                remark2: contract.remark2,
                remark3: contract.remark3,
                remark4: contract.remark4,
                isVirtual: !contract.id
            }
        })

        // 4. 组装独立合同驱动的视图模型
        const standaloneModels = standaloneContracts.map((c: any) => ({
            id: c.id,
            projectId: null,
            seq: c.seq || 0,
            contractNumber: null,
            companyName: "",  // Contract 表无此字段，独立合同无法显示名称
            projectName: "",  // Contract 表无此字段
            contractDate: null,
            paymentMethod: null,
            deliveryDate: null,
            acceptanceDate: c.acceptanceDate,
            shipmentAck: null,
            contractAmount: 0,
            invoicedAmount: c.invoicedAmount || 0,
            completed: c.completed || false,
            paymentRemark: c.paymentRemark,
            payTime1: null,
            payAmount1: 0,
            payTime2: c.payTime2,
            payAmount2: c.payAmount2 || 0,
            payTime3: c.payTime3,
            payAmount3: c.payAmount3 || 0,
            payTime4: c.payTime4,
            payAmount4: c.payAmount4 || 0,
            paymentNote: c.paymentNote,
            remark1: c.remark1,
            remark2: c.remark2,
            remark3: c.remark3,
            remark4: c.remark4,
            isVirtual: false,
            createdAt: c.createdAt,
        }))

        // 5. 合并
        const viewData = [...projectModels, ...standaloneModels]

        // 6. 统一按创建时间排序后，重新分配展示用的 seq (如果数据库中的 seq 不连续或为0)
        viewData.sort((a, b) => {
            // 优先按数据库已有的 seq 排序，如果 seq 相同或为0，按项目创建时间降序（最新的在前）
            if ((a.seq || 0) !== (b.seq || 0)) return (a.seq || 999) - (b.seq || 999)
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        })

        // 用数组索引重写展示用的 seq 确保视觉上是从 1 开始的连续数字
        const finalData = viewData.map((item, index) => ({
            ...item,
            displaySeq: index + 1
        }))

        return { success: true, data: finalData }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * 创建或更新单条合同记录
 */
export async function upsertContract(id: string | null, data: any) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        if (id) {
            await db.contract.update({
                where: { id },
                data: {
                    acceptanceDate: data.acceptanceDate ? new Date(data.acceptanceDate) : null,
                    invoicedAmount: data.invoicedAmount ?? 0,
                    paymentRemark: data.paymentRemark,
                    payTime2: data.payTime2,
                    payAmount2: data.payAmount2 ?? 0,
                    payTime3: data.payTime3,
                    payAmount3: data.payAmount3 ?? 0,
                    payTime4: data.payTime4,
                    payAmount4: data.payAmount4 ?? 0,
                    paymentNote: data.paymentNote,
                    remark1: data.remark1,
                    remark2: data.remark2,
                    remark3: data.remark3,
                    remark4: data.remark4,
                }
            })

            // 联动更新：如果是项目关联合同，更新 Client.name 和 Project.name
            const contract = await db.contract.findUnique({
                where: { id },
                select: { projectId: true }
            })
            if (contract?.projectId && data.companyName) {
                const project = await db.project.findUnique({
                    where: { id: contract.projectId },
                    select: { clientId: true }
                })
                if (project) {
                    // 更新项目名称 (如果需要)
                    if (data.projectName) {
                        await db.project.update({ 
                            where: { id: contract.projectId }, 
                            data: { name: data.projectName } 
                        })
                    }
                    // 更新客户名称
                    if (project.clientId) {
                        await db.client.update({
                            where: { id: project.clientId },
                            data: { name: data.companyName }
                        })
                    }
                }
            }


        } else {
            const maxSeq = await db.contract.aggregate({ _max: { seq: true } })
            await db.contract.create({
                data: {
                    seq: (maxSeq._max.seq ?? 0) + 1,
                    // 不再向 Contract 写入任何冗余与剥离出的字段
                }
            })
        }


        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * 更新单个字段（智能分流到 Project 或 Contract）
 */
export async function updateContractField(id: string, field: string, value: any) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        // 识别 ID。如果以 virtual- 开头，则是尚未在 Contract 表中创建的项目
        let projectId = ""
        let contractId = ""
        if (id.startsWith("virtual-")) {
            projectId = id.replace("virtual-", "")
        } else {
            const c = await db.contract.findUnique({ where: { id }, select: { projectId: true } })
            contractId = id
            projectId = c?.projectId || ""
        }

        // 类型转换
        const dateFields = ['contractDate', 'deliveryDate', 'acceptanceDate', 'shipDate', 'payTime1', 'payTime2', 'payTime3', 'payTime4', 'contractSignDate']
        const numFields = ['contractAmount', 'invoicedAmount', 'payAmount1', 'payAmount2', 'payAmount3', 'payAmount4', 'seq', 'amount', 'downPayment']
        const boolFields = ['completed']

        let procVal = value
        if (boolFields.includes(field)) procVal = Boolean(value)
        else if (dateFields.includes(field)) procVal = value ? new Date(value) : null
        else if (numFields.includes(field)) procVal = value ? parseFloat(value) : 0

        // 字段映射分流
        // 1. 分流到 Project / Client / Device 表的字段
        const projectFields = ['companyName', 'contractNumber', 'contractDate', 'deliveryDate', 'contractAmount', 'payAmount1', 'payTime1', 'paymentMethod', 'projectName', 'shipDate']
        if (projectFields.includes(field)) {
            if (!projectId) return { error: "Missing Project Association" }

            const updateData: any = {}
            if (field === 'contractNumber') updateData.contractNumber = String(value)
            if (field === 'contractDate') updateData.contractSignDate = procVal
            if (field === 'deliveryDate') {
                updateData.delivery = procVal
                updateData.isDeliveryManual = true
            }
            if (field === 'contractAmount') updateData.amount = procVal
            if (field === 'payAmount1') updateData.downPayment = procVal
            if (field === 'payTime1') updateData.downPaymentAckDate = procVal
            if (field === 'paymentMethod') updateData.paymentTerm = String(value)
            if (field === 'projectName') updateData.name = String(value)

            if (Object.keys(updateData).length > 0) {
                await (prisma.project as any).update({ where: { id: projectId }, data: updateData })
            }

            if (field === 'companyName') {
                const project = await (prisma.project as any).findUnique({ where: { id: projectId }, select: { clientId: true } })
                if (project?.clientId) {
                    await (prisma.client as any).update({ where: { id: project.clientId }, data: { name: String(value) } })
                }
            }

            if (field === 'shipDate') {
                // 更新该项目下所有设备的发货日期
                await (prisma.device as any).updateMany({
                    where: { projectId },
                    data: { shipmentAck: procVal }
                })
            }
        } else {
            // 2. 分流到 Contract 表的字段
            // 如果不存在记录则创建
            if (!contractId && projectId) {
                const count = await db.contract.count()
                const newC = await db.contract.create({
                    data: {
                        projectId,
                        seq: count + 1,
                        [field]: procVal
                    }
                })
                contractId = newC.id
            } else if (contractId) {
                // 确保更新字段是在 Contract 表中定义的真实属性
                const allowedContractFields = ['acceptanceDate', 'invoicedAmount', 'completed', 'paymentRemark', 'payTime2', 'payAmount2', 'payTime3', 'payAmount3', 'payTime4', 'payAmount4', 'paymentNote', 'remark1', 'remark2', 'remark3', 'remark4', 'seq']
                if (allowedContractFields.includes(field)) {
                    await db.contract.update({
                        where: { id: contractId },
                        data: { [field]: procVal }
                    })
                }
            }

        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// 已废弃，通过 getContracts 实时聚合
export async function syncProjectsToContracts() {
    return { success: true }
}

/**
 * 删除合同记录
 */
export async function deleteContract(id: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        // 1. 判断是否为虚拟 ID (只有项目，没有合同记录)
        if (id.startsWith("virtual-")) {
            const projectId = id.replace("virtual-", "")
            // 调用之前在 overview.ts 中实现的彻底删除逻辑副本
            await (prisma.part as any).deleteMany({
                where: { device: { projectId: projectId } }
            })
            await prisma.device.deleteMany({ where: { projectId } })
            await (prisma as any).invoice.deleteMany({ where: { projectId } })
            await (prisma as any).contract.deleteMany({ where: { projectId } })
            await db.project.delete({ where: { id: projectId } })
        } else {
            // 2. 检查该合同是否关联了项目
            const contract = await db.contract.findUnique({
                where: { id },
                select: { projectId: true }
            })

            if (contract?.projectId) {
                // 如果有关联项目，直接执行项目级彻底删除
                const projectId = contract.projectId
                await db.part.deleteMany({
                    where: { device: { projectId: projectId } }
                })
                await db.device.deleteMany({ where: { projectId } })
                await db.invoice.deleteMany({ where: { projectId } })
                await db.contract.deleteMany({ where: { projectId } }) // 会连带删除此 contract
                await db.project.delete({ where: { id: projectId } })
            } else {
                // 3. 纯手动行，仅删除合同记录
                await db.contract.delete({ where: { id } })
            }
        }

        // 重新排列其余记录的编号 (seq)
        const remainingContracts = await db.contract.findMany({
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, seq: true }
        })

        for (let i = 0; i < remainingContracts.length; i++) {
            if (remainingContracts[i].seq !== i + 1) {
                await db.contract.update({
                    where: { id: remainingContracts[i].id },
                    data: { seq: i + 1 }
                })
            }
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
