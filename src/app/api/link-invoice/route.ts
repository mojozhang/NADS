import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const { projectId, parsed } = body

        if (!projectId || !parsed) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
        }

        const amount = typeof parsed.amount === 'string' ? parseFloat(parsed.amount) : (parsed.amount || 0)

        // 1. 查找项目与其合同
        const project = await (prisma.project as any).findUnique({
            where: { id: projectId },
            include: { contract: true }
        })

        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

        let contract = project.contract
        if (!contract) {
            // 如果不存在合同记录，则新建
            contract = await (prisma as any).contract.create({
                data: {
                    projectId: project.id,
                    invoicedAmount: amount
                }
            })
        } else {
            // 累加已开发票额度
            await (prisma as any).contract.update({
                where: { id: contract.id },
                data: { invoicedAmount: { increment: amount } }
            })
        }

        // 2. 创建发票详细凭证记录
        await (prisma as any).invoice.create({
            data: {
                invoiceNumber: parsed.invoiceNumber,
                amount: amount,
                date: parsed.date ? new Date(parsed.date) : null,
                buyerName: parsed.buyerName,
                projectId: project.id,
                contractId: contract.id,
                status: "manual" // 标记为手动关联
            }
        })

        return NextResponse.json({ success: true, message: "手动关联对账成功" })
    } catch (error: any) {
        console.error("[Manual Link Error]:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
