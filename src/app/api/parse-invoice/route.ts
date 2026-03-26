import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || ""
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1"

const INVOICE_PROMPT = `请分析这份上传的文件内容。请从中提取出以下结构化的关键信息：
1. 文档类型 (documentType): 如果是发票，填 "invoice"；如果是产品合同、技术协议、报价单等，填 "contract"；如果是其他，填 "other"。
2. 发票号码 (Invoice Number) (仅当为发票时)
3. 开票日期 (格式为 YYYY-MM-DD) (仅当为发票时)
4. 购方名称 (即客户公司名称。注意：请从 "购方" 或 "购买方" 栏目下提取名称。如果是上海高得自动化设备有限公司销货给对方，那么对账单里的购方就是客户)
5. 价税合计金额 (纯数字，不带货币符号。例如 113000.00)

请务必遵守此 JSON 格式进行返回，不要带有任何额外的 Markdown 代码块包装标记：
{
  "documentType": "invoice" | "contract" | "other",
  "invoiceNumber": "...",
  "date": "YYYY-MM-DD",
  "buyerName": "...",
  "amount": number
}`

async function extractOCRWithSiliconFlow(buffer: Buffer, originalMimeType: string, fileName: string): Promise<string> {
    if (!SILICONFLOW_API_KEY) throw new Error("SILICONFLOW_API_KEY 未配置")

    const isPDF = fileName.toLowerCase().endsWith(".pdf") || originalMimeType.includes("pdf")
    const base64Images: string[] = []

    if (isPDF) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const canvas = require('canvas')
        const data = new Uint8Array(buffer)
        const pdfDocument = await pdfjsLib.getDocument({ data }).promise
        const page = await pdfDocument.getPage(1) // 发票通常只有一页
        const viewport = page.getViewport({ scale: 2.0 })
        const canvasInstance = canvas.createCanvas(viewport.width, viewport.height)
        const context = canvasInstance.getContext('2d')
        await page.render({ canvasContext: context, viewport: viewport }).promise
        base64Images.push(canvasInstance.toBuffer('image/jpeg').toString('base64'))
    } else {
        base64Images.push(buffer.toString('base64'))
    }

    const content = [
        { type: "text", text: "请精准识别出这份发票中的文字内容，特别是发票号码、开票日期、购方名称和总金额。" },
        ...base64Images.map(img => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${img}` }
        }))
    ]

    const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({
            model: "Pro/Qwen/Qwen2.5-VL-7B-Instruct",
            messages: [{ role: "user", content: content }],
            temperature: 0.1,
            max_tokens: 2048
        })
    })

    if (!response.ok) throw new Error("OCR Failed")
    const resData = await response.json()
    return resData.choices[0]?.message?.content || ""
}

async function refineJSONWithDeepSeek(rawText: string): Promise<string> {
    const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            messages: [
                { role: "system", content: "你是一个专业的发票数据解析专家。你的任务是根据提供的原始文字，提取出指定的结构化 JSON 数据。" },
                { role: "user", content: `原始文本：\n${rawText}\n\n${INVOICE_PROMPT}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    })

    if (!response.ok) throw new Error("Refinement Failed")
    const resData = await response.json()
    return resData.choices[0]?.message?.content || ""
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get("file") as File
        if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

        const buffer = Buffer.from(await file.arrayBuffer())
        const rawText = await extractOCRWithSiliconFlow(buffer, file.type, file.name)
        const jsonText = await refineJSONWithDeepSeek(rawText)

        const cleanText = jsonText.replace(/```json\s*|\s*```/g, '').trim()
        const parsedData = JSON.parse(cleanText)

        // --- 强制文档类型检查 ---
        if (parsedData.documentType === 'contract') {
            return NextResponse.json({ error: "检测到上传的是【合同/协议】，请切换到“上传合同”模式后再试。" }, { status: 400 })
        }
        if (parsedData.documentType !== 'invoice') {
            return NextResponse.json({ error: "无法识别的文件类型，请确保上传的是有效的【发票】。" }, { status: 400 })
        }

        // --- 核心对账逻辑 ---
        const buyerName = parsedData.buyerName || ""
        const amount = parsedData.amount || 0

        // 1. 查找客户
        const client = await prisma.client.findFirst({
            where: { name: { contains: buyerName } }
        })

        if (!client) {
            return NextResponse.json({
                success: true,
                collision: true,
                reason: "未找到对应企业",
                parsed: parsedData,
                candidates: []
            })
        }

        // 2. 查找该客户下所有活跃项目
        const activeProjects = await prisma.project.findMany({
            where: { clientId: client.id, status: { not: "archived" } },
            include: { devices: true, contract: true } as any
        })

        if (activeProjects.length === 0) {
            return NextResponse.json({
                success: true,
                collision: true,
                reason: "该企业下无活跃项目",
                parsed: parsedData,
                candidates: []
            })
        }

        // 3. 冲突检测逻辑
        if (activeProjects.length > 1) {
            return NextResponse.json({
                success: true,
                collision: true,
                reason: "检测到多个活跃项目",
                parsed: parsedData,
                candidates: activeProjects.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    contractNumber: p.contractNumber,
                    devices: (p.devices || []).map((d: any) => `${d.category}x${d.quantity}`).join(', ')
                }))
            })
        }

        // 4. 自动入账 (单项目情况)
        const project = activeProjects[0]
        let contract = (project as any).contract

        if (!contract) {
            contract = await prisma.$transaction(async (tx) => {
                const maxSeq = await (tx as any).contract.aggregate({ _max: { seq: true } })
                return (tx as any).contract.create({
                    data: { projectId: project.id, seq: (maxSeq._max.seq ?? 0) + 1, invoicedAmount: amount }
                })
            })
        } else {
            await (prisma as any).contract.update({
                where: { id: contract.id },
                data: { invoicedAmount: { increment: amount } }
            })
        }

        // 创建发票记录
        const invoice = await (prisma as any).invoice.create({
            data: {
                invoiceNumber: parsedData.invoiceNumber,
                amount: amount,
                date: parsedData.date ? new Date(parsedData.date) : null,
                buyerName: buyerName,
                projectId: project.id,
                contractId: contract.id,
                status: "matched"
            }
        })

        return NextResponse.json({
            success: true,
            message: "发票识别成功并已自动关联项目",
            data: parsedData,
            invoiceId: invoice.id,
            projectId: project.id
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
