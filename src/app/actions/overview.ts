"use server"

import prisma from "@/lib/prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { addDays, parseISO, differenceInDays, isWeekend, subDays, format } from "date-fns"

// 辅助函数：倒推N个工作日
const subtractWorkdays = (date: Date, days: number): Date => {
    let result = new Date(date)
    let count = 0
    let iterations = 0
    const maxIterations = 1000 // 安全阈值，防止无限循环
    while (count < days && iterations < maxIterations) {
        result = subDays(result, 1)
        if (!isWeekend(result)) {
            count++
        }
        iterations++
    }
    return result
}

// 辅助函数：正推N个自然日/工作日
const addDaysCustom = (date: Date, days: number, isWorkday: boolean): Date => {
    let result = new Date(date)
    let count = 0
    let iterations = 0
    const maxIterations = 1000
    while (count < days && iterations < maxIterations) {
        result = addDays(result, 1)
        if (!isWorkday || !isWeekend(result)) {
            count++
        }
        iterations++
    }
    return result
}

const calculateEstimationsV2 = (
    deliveryDate: Date,
    designDays: number,
    purchaseDays: number,
    debugDays: number,
    baseDate: Date | null = null,
    existingData: {
        designEst?: Date | null,
        mfgEst?: Date | null,
        standardPartEst?: Date | null,
        customPartEst?: Date | null,
        outsourcedPartEst?: Date | null,
        electricalPartEst?: Date | null,
        assemblyEst?: Date | null,
        debugEst?: Date | null,
        delivery?: Date | null,
        isDesignManual?: boolean,
        isMfgManual?: boolean,
        isStandardManual?: boolean,
        isCustomManual?: boolean,
        isOutsourcedManual?: boolean,
        isElectricalManual?: boolean,
        isAssemblyManual?: boolean,
        isDebugManual?: boolean,
        isShipmentManual?: boolean
    } = {}
) => {
    const start = baseDate || new Date()

    // 1. 各阶段节点计算（采用倒推+正推结合逻辑，并尊重手动锁定）

    // 发货/交期 (Shipment)
    const finalDelivery = existingData.isShipmentManual && existingData.delivery
        ? new Date(existingData.delivery)
        : new Date(deliveryDate)

    // 调试完成 (Debug / Factory)
    const debugEst = existingData.isDebugManual && existingData.debugEst
        ? new Date(existingData.debugEst)
        : new Date(finalDelivery)

    // 总装完成 (Assembly)
    const assemblyEst = existingData.isAssemblyManual && existingData.assemblyEst
        ? new Date(existingData.assemblyEst)
        : subtractWorkdays(debugEst, debugDays)

    // 物料到位汇总 (Mfg / Purchase) - 用于兼容旧 UI 盒子的 EST 展示
    const mfgEst = existingData.isMfgManual && existingData.mfgEst
        ? new Date(existingData.mfgEst)
        : subtractWorkdays(assemblyEst, 1)

    // 四个独立物料子项 (如果未手动锁定，则默认跟随 mfgEst)
    const standardPartEst = existingData.isStandardManual && existingData.standardPartEst
        ? new Date(existingData.standardPartEst)
        : new Date(mfgEst)

    const customPartEst = existingData.isCustomManual && existingData.customPartEst
        ? new Date(existingData.customPartEst)
        : new Date(mfgEst)

    const outsourcedPartEst = existingData.isOutsourcedManual && existingData.outsourcedPartEst
        ? new Date(existingData.outsourcedPartEst)
        : new Date(mfgEst)

    const electricalPartEst = existingData.isElectricalManual && existingData.electricalPartEst
        ? new Date(existingData.electricalPartEst)
        : new Date(mfgEst)

    // 设计完成 (Design)
    const designEst = existingData.isDesignManual && existingData.designEst
        ? new Date(existingData.designEst)
        : addDaysCustom(start, designDays, true)

    return {
        designEst,
        mfgEst,
        standardPartEst,
        customPartEst,
        outsourcedPartEst,
        electricalPartEst,
        assemblyEst,
        debugEst,
        delivery: finalDelivery
    }
}

/**
 * 获取项目概览详情（包含设备、物料组汇总等）
 */
export async function getProjectOverview(projectId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                client: true,
                devices: {
                    include: {
                        parts: {
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                },
                contract: {
                    include: {
                        invoices: true
                    }
                },
                invoices: true
            }
        })

        if (!project) return { error: "Project not found" }

        return { success: true, data: project }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getDashboardProjects() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return { error: "Unauthorized" }
        }

        const projects = await prisma.project.findMany({
            orderBy: {
                createdAt: "desc"
            },
            include: {
                client: true,
                devices: true
            }
        })

        const now = new Date()

        // 在内存里补全没有估算期的项目参数用于渲染
        const enrichedProjects = projects.map(project => {
            const p = project as any

            // 确定项目最终交期
            let finalDelivery = p.delivery
            const baseStart = p.downPaymentAckDate || p.createdAt

            if (!p.isDeliveryManual && !p.shipmentAck) {
                const effectiveDays = p.manualDeliveryDays ?? p.deliveryDays
                const effectiveType = p.manualDeliveryType ?? p.deliveryType
                const effectiveTrigger = p.manualDeliveryTrigger ?? p.deliveryTrigger

                if (effectiveDays || p.deliveryDays) {
                    const days = effectiveDays ?? p.deliveryDays ?? 45
                    if (effectiveTrigger === "downpayment" && !p.downPaymentAckDate) {
                        finalDelivery = null
                    } else {
                        const isWorkday = effectiveType === "workday" || p.deliveryType === "workday"
                        finalDelivery = addDaysCustom(baseStart, days, isWorkday)
                    }
                }
            }

            if (!finalDelivery) {
                finalDelivery = addDays(p.createdAt, 60)
            }

            // 为项目下的每个设备计算其进度节点
            const enrichedDevices = (p.devices || []).map((device: any) => {
                const estTime = calculateEstimationsV2(
                    finalDelivery,
                    p.designDaysPreset || 3,
                    p.purchaseDaysPreset || 2,
                    p.debugDaysPreset || 4,
                    baseStart,
                    {
                        designEst: device.designEst,
                        mfgEst: device.mfgEst,
                        standardPartEst: device.standardPartEst,
                        customPartEst: device.customPartEst,
                        outsourcedPartEst: device.outsourcedPartEst,
                        electricalPartEst: device.electricalPartEst,
                        assemblyEst: device.assemblyEst,
                        debugEst: device.debugEst,
                        delivery: finalDelivery,
                        isDesignManual: device.isDesignManual,
                        isMfgManual: device.isMfgManual,
                        isStandardManual: device.isStandardManual,
                        isCustomManual: device.isCustomManual,
                        isOutsourcedManual: device.isOutsourcedManual,
                        isElectricalManual: device.isElectricalManual,
                        isAssemblyManual: device.isAssemblyManual,
                        isDebugManual: device.isDebugManual,
                        isShipmentManual: device.isShipmentManual
                    }
                )

                return {
                    ...device,
                    designEst: estTime.designEst,
                    mfgEst: estTime.mfgEst,
                    standardPartEst: estTime.standardPartEst,
                    customPartEst: estTime.customPartEst,
                    outsourcedPartEst: estTime.outsourcedPartEst,
                    electricalPartEst: estTime.electricalPartEst,
                    assemblyEst: estTime.assemblyEst,
                    debugEst: estTime.debugEst,
                    delivery: estTime.delivery // 同步设备的最终交付期数据
                }
            })

            return {
                ...p,
                delivery: finalDelivery,
                devices: enrichedDevices
            }
        })

        return { success: true, data: enrichedProjects }

    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Failed to fetch projects overview" }
    }
}

/**
 * 更新项目名称（同时同步 Client.name 和 Contract.companyName）
 */
export async function updateProjectName(projectId: string, name: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        // 更新 Project.name
        const project = await (prisma.project as any).update({
            where: { id: projectId },
            data: { name }
        })

        // 同步更新 Client.name
        if (project.clientId) {
            await prisma.client.update({
                where: { id: project.clientId },
                data: { name }
            })
        }

        // 同步更新关联的 Contract（已在模型中移除冗余字段，无需同步）

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateProjectDelivery(
    projectId: string,
    data: {
        downPayment: number | null,
        downPaymentAckDate: Date | null,
        delivery: Date | null,
        manualDeliveryDays?: number | null,
        manualDeliveryType?: string | null,
        manualDeliveryTrigger?: string | null,
        // 各阶段微调参数
        designEst?: Date | null,
        mfgEst?: Date | null,
        standardPartEst?: Date | null,
        customPartEst?: Date | null,
        outsourcedPartEst?: Date | null,
        electricalPartEst?: Date | null,
        assemblyEst?: Date | null,
        debugEst?: Date | null,
        isDesignManual?: boolean,
        isMfgManual?: boolean,
        isStandardManual?: boolean,
        isCustomManual?: boolean,
        isOutsourcedManual?: boolean,
        isElectricalManual?: boolean,
        isAssemblyManual?: boolean,
        isDebugManual?: boolean,
        isShipmentManual?: boolean,
        isDeliveryManual?: boolean
    }
) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return { error: "Unauthorized" }
        }

        // 1. 获取当前现状
        const currentProject = (await prisma.project.findUnique({ where: { id: projectId } })) as any
        if (!currentProject) return { error: "Project not found" }

        // 保存补全规则
        const activeManualDays = data.manualDeliveryDays !== undefined ? data.manualDeliveryDays : currentProject.manualDeliveryDays
        const activeManualType = data.manualDeliveryType !== undefined ? data.manualDeliveryType : currentProject.manualDeliveryType
        const activeManualTrigger = data.manualDeliveryTrigger !== undefined ? data.manualDeliveryTrigger : currentProject.manualDeliveryTrigger

        let finalDelivery = data.delivery // 用户传来的强制日期
        let isManualUpdate = !!data.delivery // 是否属于显式的“强制修改”动作

        // 优先级：手动补全规则 > 合同解析规则
        const effectiveDays = activeManualDays ?? currentProject.deliveryDays
        const effectiveType = activeManualType ?? currentProject.deliveryType
        const effectiveTrigger = activeManualTrigger ?? currentProject.deliveryTrigger

        // 3. 准备排期估算参数 (提前定义，因为联动逻辑中会用到)
        const baseStart = data.downPaymentAckDate || currentProject.downPaymentAckDate || currentProject.createdAt

        // 2. 核心联动逻辑判定
        const isDpDateChanged = data.downPaymentAckDate &&
            (!currentProject.downPaymentAckDate || new Date(data.downPaymentAckDate).getTime() !== new Date(currentProject.downPaymentAckDate).getTime())

        // 计算系统推荐的自动交期 (基准)
        const isWorkday = effectiveType === "workday"
        const days = effectiveDays || 45
        const autoCalculatedDelivery = addDaysCustom(baseStart, days, isWorkday)

        if (data.isDeliveryManual === false) {
            // 情况 S: 前端显式关闭手动干预 (选择“自动联动”模式)
            finalDelivery = autoCalculatedDelivery
            isManualUpdate = false
            data.manualDeliveryDays = null;
            // 重置所有前端传来的手动锁定标志，使其回落到自动推荐
            data.isDesignManual = false;
            data.isMfgManual = false;
            data.isStandardManual = false;
            data.isCustomManual = false;
            data.isOutsourcedManual = false;
            data.isElectricalManual = false;
            data.isAssemblyManual = false;
            data.isDebugManual = false;
            data.isShipmentManual = false;

            data.designEst = null;
            data.standardPartEst = null;
            data.customPartEst = null;
            data.outsourcedPartEst = null;
            data.electricalPartEst = null;
            data.assemblyEst = null;
            data.debugEst = null;
        } else if (isDpDateChanged && effectiveTrigger === "downpayment" && !data.isDeliveryManual) {
            // 情况 A: 首款到账日发生变化 -> 强制重置，回落到自动计算值
            finalDelivery = autoCalculatedDelivery
            isManualUpdate = false

            // 重置所有前端传来的手动锁定标志，使其回落到自动推荐
            data.isDesignManual = false;
            data.isMfgManual = false;
            data.isStandardManual = false;
            data.isCustomManual = false;
            data.isOutsourcedManual = false;
            data.isElectricalManual = false;
            data.isAssemblyManual = false;
            data.isDebugManual = false;
            data.isShipmentManual = false;

            data.designEst = null;
            data.standardPartEst = null;
            data.customPartEst = null;
            data.outsourcedPartEst = null;
            data.electricalPartEst = null;
            data.assemblyEst = null;
            data.debugEst = null;
        } else if (data.isShipmentManual && finalDelivery) {
            // 情况 B: 用户显式开启了手动交期锁定
            isManualUpdate = true
        } else {
            // 情况 C: 检查传来的 finalDelivery 是否等于系统计算的 auto
            if (finalDelivery && format(finalDelivery, 'yyyy-MM-dd') === format(autoCalculatedDelivery, 'yyyy-MM-dd')) {
                isManualUpdate = false
            } else if (finalDelivery) {
                isManualUpdate = true
            } else {
                finalDelivery = currentProject.delivery
                isManualUpdate = currentProject.isDeliveryManual
            }
        }

        // 核心修正：如果最终判定为自动模式，强制抹除所有节点的手动锁定（彻底清空历史干扰）
        if (!isManualUpdate) {
            data.isDesignManual = false;
            data.isStandardManual = false;
            data.isCustomManual = false;
            data.isOutsourcedManual = false;
            data.isElectricalManual = false;
            data.isAssemblyManual = false;
            data.isDebugManual = false;
            data.isShipmentManual = false;

            // 清空手动时间映射，让 calculateEstimationsV2 按 auto 推荐值跑
            data.designEst = null;
            data.standardPartEst = null;
            data.customPartEst = null;
            data.outsourcedPartEst = null;
            data.electricalPartEst = null;
            data.assemblyEst = null;
            data.debugEst = null;
        }

        // 无论如何都要重新运行一次倒推引擎
        const newEstimates = calculateEstimationsV2(
            finalDelivery || addDays(currentProject.createdAt, 60),
            currentProject.designDaysPreset || 3,
            currentProject.purchaseDaysPreset || 2,
            currentProject.debugDaysPreset || 4,
            baseStart,
            { ...data, delivery: finalDelivery } // 明确传递最终确认的交期
        )

        // 4. 执行更新
        await (prisma.project as any).update({
            where: { id: projectId },
            data: {
                downPayment: data.downPayment,
                downPaymentAckDate: data.downPaymentAckDate,
                manualDeliveryDays: data.manualDeliveryDays !== undefined ? data.manualDeliveryDays : currentProject.manualDeliveryDays,
                manualDeliveryType: activeManualType,
                manualDeliveryTrigger: activeManualTrigger,
                delivery: finalDelivery,
                isDeliveryManual: isManualUpdate,
                updatedAt: new Date()
            }
        })

        // 同时更新该项目下所有设备的所有排期节点及手动状态标志
        await (prisma.device as any).updateMany({
            where: { projectId },
            data: {
                designEst: newEstimates.designEst,
                mfgEst: newEstimates.mfgEst,
                standardPartEst: newEstimates.standardPartEst,
                customPartEst: newEstimates.customPartEst,
                outsourcedPartEst: newEstimates.outsourcedPartEst,
                electricalPartEst: newEstimates.electricalPartEst,
                assemblyEst: newEstimates.assemblyEst,
                debugEst: newEstimates.debugEst,
                isDesignManual: data.isDesignManual ?? false,
                isMfgManual: data.isMfgManual ?? false,
                isStandardManual: data.isStandardManual ?? false,
                isCustomManual: data.isCustomManual ?? false,
                isOutsourcedManual: data.isOutsourcedManual ?? false,
                isElectricalManual: data.isElectricalManual ?? false,
                isAssemblyManual: data.isAssemblyManual ?? false,
                isDebugManual: data.isDebugManual ?? false,
                isShipmentManual: data.isShipmentManual ?? false,
            }
        })

        // 同步交付日期到合同收款表
        if (finalDelivery) {
            try {
                await (prisma as any).contract.updateMany({
                    where: { projectId },
                    data: { deliveryDate: finalDelivery }
                })
            } catch (_) { /* 合同记录可能不存在，忽略 */ }
        }

        return { success: true }
    } catch (error: any) {
        console.error("Update error:", error)
        return { error: error.message }
    }
}

/**
 * 切换设备里程碑状态
 */
export async function toggleMilestone(deviceId: string, field: 'designAck' | 'standardPartAck' | 'customPartAck' | 'outsourcedPartAck' | 'electricalPartAck' | 'assemblyAck' | 'debugAck' | 'shipmentAck') {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const device = (await prisma.device.findUnique({
            where: { id: deviceId },
            include: { project: true }
        })) as any
        if (!device) return { error: "Device not found" }

        const project = device.project
        const isActivating = !device[field]

        if (isActivating) {
            // 严格工序校验逻辑 (基于单个设备内部)
            if (['standardPartAck', 'customPartAck', 'outsourcedPartAck', 'electricalPartAck'].includes(field)) {
                if (!device.designAck) return { error: "请先确认[设计完成]" }
            }
            if (field === 'assemblyAck') {
                if (!device.standardPartAck || !device.customPartAck || !device.outsourcedPartAck || !device.electricalPartAck) {
                    return { error: "该设备物料（标准、自制、外协、电气）均未到位，无法进行总装确认" }
                }
            }
            if (field === 'debugAck') {
                if (!device.assemblyAck) return { error: "请先确认[总装完成]" }
            }
            if (field === 'shipmentAck') {
                if (!device.debugAck) return { error: "请先确认[调试出厂]" }
            }
        }

        const currentValue = device[field]
        const newValue = currentValue ? null : new Date()

        const updateData: any = {
            [field]: newValue
        }

        // 勾选此项时（激活），将当前时间顺便写入该具体的设备计划/实际时间字段进行展示
        if (isActivating && newValue) {
            if (field === 'designAck') updateData.designEst = newValue
            if (field === 'standardPartAck') updateData.standardPartEst = newValue
            if (field === 'customPartAck') updateData.customPartEst = newValue
            if (field === 'outsourcedPartAck') updateData.outsourcedPartEst = newValue
            if (field === 'electricalPartAck') updateData.electricalPartEst = newValue

            if (['standardPartAck', 'customPartAck', 'outsourcedPartAck', 'electricalPartAck'].includes(field)) {
                updateData.mfgEst = newValue
            }
            if (field === 'assemblyAck') updateData.assemblyEst = newValue
            if (field === 'debugAck') updateData.debugEst = newValue
        }

        await prisma.device.update({
            where: { id: deviceId },
            data: updateData
        })

        // 特殊逻辑：如果是确认发货，同步更新项目的 delivery 日期为当天，实现工序联动
        if (field === 'shipmentAck' && newValue) {
            await (prisma.project as any).update({
                where: { id: project.id },
                data: { delivery: newValue }
            })
            // 同步交付日期到合同收款表
            try {
                await (prisma as any).contract.updateMany({
                    where: { projectId: project.id },
                    data: { deliveryDate: newValue }
                })
            } catch (_) { /* 忽略合同表不存在的情况 */ }
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * 归档项目
 */
export async function archiveProject(projectId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const project = await prisma.project.findUnique({ where: { id: projectId } })
        if (!project) return { error: "Project not found" }

        const p = project as any
        if (!p.shipmentAck) {
            return { error: "项目尚未发货，无法归档" }
        }

        await prisma.project.update({
            where: { id: projectId },
            data: {
                status: 'completed'
            }
        })

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * 取消归档项目
 */
export async function unarchiveProject(projectId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        await prisma.project.update({
            where: { id: projectId },
            data: { status: 'active' }
        })

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * 删除项目（同时删除关联的零件、设备、合同）
 */
export async function deleteProject(projectId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const db = prisma as any
        // 删除关联数据
        await (prisma.part as any).deleteMany({
            where: {
                device: {
                    projectId: projectId
                }
            }
        })
        await prisma.device.deleteMany({ where: { projectId } })
        await (prisma as any).contract.deleteMany({ where: { projectId } })
        // 删除项目
        await db.project.delete({ where: { id: projectId } })

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
