"use server"

import prisma from "@/lib/prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/**
 * 按类型分组获取设备零件清单
 */
export async function getDevicePartsByType(deviceId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const device = await prisma.device.findUnique({
            where: { id: deviceId },
            include: {
                parts: {
                    orderBy: { createdAt: 'asc' }
                },
                project: {
                    include: {
                        contract: true
                    }
                }
            } as any
        })
        if (!device) return { error: "Device not found" }

        const parts = (device as any).parts || []

        return {
            success: true,
            deviceCategory: (device as any).category,
            projectTitle: (device as any).project.name,
            contractNumber: (device as any).project?.contractNumber || '',
            projectId: (device as any).projectId,
            standard: parts.filter((p: any) => p.type === 'standard'),
            machined: parts.filter((p: any) => p.type === 'machined'),
            outsourced: parts.filter((p: any) => p.type === 'outsourced'),
            electrical: parts.filter((p: any) => p.type === 'electrical'),
        }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * 更新单条零件信息（日期、入库、备注等）
 */
export async function updatePart(partId: string, data: {
    issueDate?: string | null,
    arrivalDate?: string | null,
    isStocked?: boolean,
    remark?: string,
    quantity?: number,
    unitPrice?: number,
    actualCost?: number,
    supplierUrl?: string,
    name?: string,
    supplier?: string,
    material?: string,
    spec?: string,
    partNumber?: string,
    invoiceInfo?: string,
    expressCompany?: string,
    trackingNumber?: string,
    [key: string]: any
}) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const updateData: any = {}
        if (data.issueDate !== undefined) updateData.issueDate = data.issueDate ? new Date(data.issueDate) : null
        if (data.arrivalDate !== undefined) updateData.arrivalDate = data.arrivalDate ? new Date(data.arrivalDate) : null
        if (data.isStocked !== undefined) updateData.isStocked = data.isStocked
        if (data.remark !== undefined) updateData.remark = data.remark
        if (data.quantity !== undefined) updateData.quantity = data.quantity
        if (data.unitPrice !== undefined) updateData.unitPrice = data.unitPrice
        if (data.actualCost !== undefined) updateData.actualCost = data.actualCost
        if (data.supplierUrl !== undefined) updateData.supplierUrl = data.supplierUrl
        if (data.name !== undefined) updateData.name = data.name
        if (data.supplier !== undefined) updateData.supplier = data.supplier
        if (data.material !== undefined) updateData.material = data.material
        if (data.spec !== undefined) updateData.spec = data.spec
        if (data.partNumber !== undefined) updateData.partNumber = data.partNumber
        if (data.invoiceInfo !== undefined) updateData.invoiceInfo = data.invoiceInfo
        if (data.expressCompany !== undefined) updateData.expressCompany = data.expressCompany
        if (data.trackingNumber !== undefined) updateData.trackingNumber = data.trackingNumber

        // 如果到货了自动更新 status
        if (data.isStocked) updateData.status = 'received'
        else if (data.arrivalDate) updateData.status = 'received'
        else if (data.issueDate) updateData.status = 'ordering'

        const updated = await prisma.part.update({
            where: { id: partId },
            data: updateData
        })

        return { success: true, data: updated }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * 创建一条新零件记录（空行）
 */
export async function createPart(deviceId: string, type: 'standard' | 'machined' | 'outsourced' | 'electrical') {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const part = await (prisma as any).part.create({
            data: {
                deviceId: deviceId,
                type: type,
                name: '',
                quantity: 1,
                unitPrice: 0,
                status: 'pending',
            }
        })

        return { success: true, data: part }
    } catch (error: any) {
        console.error('SERVER ACTION ERROR (createPart):', error)
        return { error: error.message || "Unknown server error" }
    }
}

/**
 * 删除一条零件记录
 */
export async function deletePart(partId: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        await prisma.part.delete({ where: { id: partId } })
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}
