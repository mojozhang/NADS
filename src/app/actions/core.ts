"use server"

import prisma from "@/lib/prisma/client"
import { revalidatePath } from "next/cache"

export async function createClient(data: { name: string; contact?: string; phone?: string }) {
    try {
        const client = await prisma.client.create({
            data,
        })
        revalidatePath("/dashboard")
        return { success: true, data: client }
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Unknown error occurred" }
    }
}

export async function createProject(data: {
    clientId: string
    name: string
    amount?: number
    delivery?: Date
    paymentTerm?: string
}) {
    try {
        // 生成合同编号：GD + 日期yyyyMMdd + 2位当天序号
        const now = new Date()
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        const prefix = `GD${dateStr}`

        // 查询当天已有的最大序号
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const todayEnd = new Date(todayStart.getTime() + 86400000)
        const existing = await (prisma.project as any).findMany({
            where: {
                contractNumber: { startsWith: prefix }
            },
            select: { contractNumber: true },
            orderBy: { contractNumber: 'desc' },
            take: 1
        })

        let seq = 1
        if (existing.length > 0 && existing[0].contractNumber) {
            const lastSeq = parseInt(existing[0].contractNumber.slice(-2))
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        const contractNumber = `${prefix}${String(seq).padStart(2, '0')}`

        const project = await (prisma.project as any).create({
            data: {
                clientId: data.clientId,
                name: data.name,
                amount: data.amount,
                delivery: data.delivery,
                paymentTerm: data.paymentTerm,
                contractNumber
            },
        })
        revalidatePath("/dashboard")
        return { success: true, data: project }
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Unknown error occurred" }
    }
}

export async function createDevice(data: {
    projectId: string
    category: string
    quantity: number
    price?: number
}) {
    try {
        const project = await prisma.project.findUnique({
            where: { id: data.projectId },
            select: { contractNumber: true }
        })

        const contractNum = project?.contractNumber || 'VAR'

        // 获取当前项目下最大的流水号
        const existingDevices = await prisma.device.findMany({
            where: { projectId: data.projectId, deviceNumber: { startsWith: `${contractNum}-` } },
            select: { deviceNumber: true }
        })

        let maxSeq = 0
        for (const d of existingDevices) {
            if (d.deviceNumber) {
                const parts = d.deviceNumber.split('-')
                if (parts.length > 1) {
                    const seq = parseInt(parts[parts.length - 1], 10)
                    if (!isNaN(seq) && seq > maxSeq) {
                        maxSeq = seq
                    }
                }
            }
        }

        const deviceNumber = `${contractNum}-${String(maxSeq + 1).padStart(2, '0')}`

        const device = await prisma.device.create({
            data: {
                ...data,
                deviceNumber
            },
        })
        revalidatePath(`/dashboard/projects/${data.projectId}`)
        return { success: true, data: device }
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Unknown error occurred" }
    }
}
