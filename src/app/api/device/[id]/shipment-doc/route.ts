import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType, AlignmentType, VerticalAlign } from "docx"
import { appendFileSync } from "fs"

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const logPath = "/tmp/nads_debug.log";
    const log = (msg: string) => appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

    try {
        log(`DEBUG: Starting DEVICE shipment-doc generation for ID: ${params.id}`);
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            log(`DEBUG: Unauthorized access attempt on device route`);
            return new Response("Unauthorized", { status: 401 })
        }

        const device: any = await prisma.device.findUnique({
            where: { id: params.id },
            include: {
                project: {
                    include: { client: true }
                }
            }
        })

        if (!device || !device.project) {
            log(`DEBUG: Device or Project not found: ${params.id}`);
            return new Response("Device or Project not found", { status: 404 })
        }

        const project = device.project
        const clientName = project.name
        const contractNumber = project.contractNumber || ""

        const now = new Date()
        const dateStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`

        const labelStyle = { size: 28, font: "SimSun" }

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 600 },
                        children: [
                            new TextRun({ text: "送 货 单", size: 48, font: "SimHei", color: "1F497D", bold: true })
                        ]
                    }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "送货单位：上海高得自动化设备有限公司", ...labelStyle })] }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `收货单位：${clientName}`, ...labelStyle })] }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `送货日期：${dateStr}`, ...labelStyle })] }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "送货地址：", ...labelStyle })] }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "联 系 人：", ...labelStyle })] }),
                    new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: `合同编号：${contractNumber}`, ...labelStyle })] }),

                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.DASHED, size: 1, color: "A0A0A0" },
                            bottom: { style: BorderStyle.DASHED, size: 1, color: "A0A0A0" },
                            left: { style: BorderStyle.DASHED, size: 1, color: "A0A0A0" },
                            right: { style: BorderStyle.DASHED, size: 1, color: "A0A0A0" },
                            insideHorizontal: { style: BorderStyle.DASHED, size: 1, color: "C0C0C0" },
                            insideVertical: { style: BorderStyle.DASHED, size: 1, color: "C0C0C0" }
                        },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ text: "序号", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: "名称", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: "规格", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: "数量", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: "备注", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                ]
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ text: "1", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: device.category || "", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: "系统配置", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: String(device.quantity || 1), alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                    new TableCell({ children: [new Paragraph({ text: device.deviceNumber ? `编号: ${device.deviceNumber}` : "", alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                                ]
                            }),
                            ...[2, 3, 4, 5].map(num => (
                                new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph({ text: String(num), alignment: AlignmentType.CENTER })] }),
                                        new TableCell({ children: [new Paragraph("")] }),
                                        new TableCell({ children: [new Paragraph("")] }),
                                        new TableCell({ children: [new Paragraph("")] }),
                                        new TableCell({ children: [new Paragraph("")] }),
                                    ]
                                })
                            ))
                        ]
                    }),

                    new Paragraph({
                        spacing: { before: 800 },
                        children: [
                            new TextRun({ text: "收货人签字：____________________", ...labelStyle })
                        ]
                    })
                ]
            }]
        })

        const buffer = await Packer.toBuffer(doc)
        log(`DEBUG: DEVICE buffer generated, size: ${buffer.length}`);

        const rawFileName = `shipment_${params.id}.docx`
        const encodedFileName = encodeURIComponent(`发货单_${device.category || '未命名'}.docx`)

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${rawFileName}"; filename*=UTF-8''${encodedFileName}`,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            }
        })
    } catch (e: any) {
        log(`DEBUG: CRITICAL DEVICE ERROR: ${e.message}\n${e.stack}`);
        return new Response("Failed to generate word doc", { status: 500 })
    }
}

