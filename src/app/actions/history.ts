"use server"

import prisma from "@/lib/prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { format } from "date-fns"

export async function getRecentProjects() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return { error: "Unauthorized" }
        }

        // 1. 获取最近的项目 (标记为合同/项目类型)
        const projects = await prisma.project.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { client: true, devices: true }
        })
        const projectHistory = projects.map(p => ({
            id: p.id,
            name: p.name,
            client: p.client,
            devices: p.devices,
            createdAt: p.createdAt,
            type: "contract"
        }))

        // 2. 获取最近的发票记录
        const invoices = await (prisma as any).invoice.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { project: { include: { client: true } } }
        })
        const invoiceHistory = invoices.map((inv: any) => ({
            id: inv.id,
            name: `增值税发票 - ${inv.invoiceNumber || '未命名'}`,
            client: inv.project?.client,
            amount: inv.amount,
            createdAt: inv.createdAt,
            type: "invoice"
        }))

        // 3. 获取最近的货款更新记录 (通过 Contract 的最后更新时间间接体现，或如果有专门记录表更好)
        // 这里暂时通过 Contract 记录体现，后续如有 PaymentTable 可更改
        const recentContracts = await (prisma as any).contract.findMany({
            orderBy: { updatedAt: "desc" },
            take: 5,
            include: { project: { include: { client: true } } }
        })
        const paymentHistory = recentContracts
            .filter((c: any) => c.payAmount2 > 0 || c.payAmount3 > 0 || c.payAmount4 > 0) // 近期有款项变动的
            .map((c: any) => ({
                id: `payment-${c.id}`,
                name: `货款录入 - ${c.project?.name || '未知项目'}`,
                client: c.project?.client,
                createdAt: c.updatedAt,
                type: "payment"
            }))

        // 合并并重新按时间排序
        const combined = [...projectHistory, ...invoiceHistory, ...paymentHistory]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10)

        return { success: true, data: combined }

    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Failed to fetch history" }
    }
}

export async function addPaymentRecord(projectId: string, amount: number, paymentDate: string, paymentNote?: string) {
    try {
        console.log("Adding payment record for project:", projectId, "amount:", amount);
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const db = prisma as any

        // 查找合同记录
        let contract = await db.contract.findUnique({
            where: { projectId }
        })
        console.log("Found contract:", !!contract);

        if (!contract) {
            console.log("Creating new contract record...");
            const count = await db.contract.count()
            contract = await db.contract.create({
                data: {
                    projectId,
                    seq: count + 1
                }
            })
        }

        // 获取关联的项目数据
        const project = await (prisma as any).project.findUnique({
            where: { id: projectId },
            select: { downPayment: true }
        })
        console.log("Found project downPayment:", project?.downPayment);

        // 处理备注追加
        let noteToUpdate = contract.paymentNote || ""
        if (paymentNote) {
            const dateStr = format(new Date(), 'yyyy-MM-dd')
            const newNote = `[${dateStr}] ${paymentNote}`
            noteToUpdate = noteToUpdate ? `${noteToUpdate}\n${newNote}` : newNote
        }

        if (!project.downPayment || project.downPayment === 0) {
            console.log("Updating Project downPayment...");
            // 更新项目表的首付款
            await (prisma as any).project.update({
                where: { id: projectId },
                data: {
                    downPayment: amount,
                    downPaymentAckDate: new Date(paymentDate)
                }
            })

            // 同时更新备注（如果有）
            if (paymentNote) {
                await db.contract.update({
                    where: { id: contract.id },
                    data: { paymentNote: noteToUpdate }
                })
            }
            console.log("Successfully updated Project table.");
            return { success: true }
        } else if (!contract.payAmount2 || contract.payAmount2 === 0) {
            console.log("Updating Contract payAmount2...");
            await db.contract.update({
                where: { id: contract.id },
                data: {
                    payAmount2: amount,
                    payTime2: paymentDate,
                    paymentNote: noteToUpdate
                }
            })
            return { success: true }
        } else if (!contract.payAmount3 || contract.payAmount3 === 0) {
            console.log("Updating Contract payAmount3...");
            await db.contract.update({
                where: { id: contract.id },
                data: {
                    payAmount3: amount,
                    payTime3: paymentDate,
                    paymentNote: noteToUpdate
                }
            })
            return { success: true }
        } else {
            console.log("Updating Contract payAmount4...");
            await db.contract.update({
                where: { id: contract.id },
                data: {
                    payAmount4: amount,
                    payTime4: paymentDate,
                    paymentNote: noteToUpdate
                }
            })
            return { success: true }
        }

    } catch (error) {
        console.error("Error in addPaymentRecord:", error);
        return { success: false, error: error instanceof Error ? error.message : "录入失败" }
    }
}
