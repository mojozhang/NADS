import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"
import { rename, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { projectId, parsed, fileUrl } = await req.json()
        if (!projectId || !fileUrl) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })

        // 1. 获取项目信息
        const project = await prisma.project.findUnique({
            where: { id: projectId }
        })
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

        // 2. 将文件从临时目录移动到正式发货单目录
        const tempPath = path.join(process.cwd(), "public", fileUrl)
        const uploadDir = path.join(process.cwd(), "public/uploads/shipments")
        await mkdir(uploadDir, { recursive: true })

        const ext = path.extname(tempPath)
        const newFileName = `${project.id}_shipment_${Date.now()}${ext}`
        const newFilePath = path.join(uploadDir, newFileName)
        const finalPublicUrl = `/uploads/shipments/${newFileName}`

        // 3. 更新数据库与文件移动原子化
        const shipDate = parsed.shipDate ? new Date(parsed.shipDate) : new Date()
        await prisma.$transaction(async (tx) => {
            await (tx as any).project.update({
                where: { id: projectId },
                data: {
                    shipmentDocName: parsed.fileName || "手动关联发货单",
                    shipmentDocUrl: finalPublicUrl,
                    delivery: shipDate
                }
            })

            await tx.device.updateMany({
                where: { projectId: projectId },
                data: { shipmentAck: shipDate }
            })

            // 在事务中执行文件移动，如果失败则触发数据库回滚
            await rename(tempPath, newFilePath)
        })

        return NextResponse.json({
            success: true,
            projectId: project.id,
            finalUrl: finalPublicUrl
        })

    } catch (error: any) {
        console.error("Link Shipment Error:", error)
        return NextResponse.json({ error: error.message || "关联失败" }, { status: 500 })
    }
}
