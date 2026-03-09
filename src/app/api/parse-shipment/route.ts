import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || ""
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1"

const SHIPMENT_PROMPT = `请分析这份上传的发货单/送货单文件内容（图片或PDF）。请从中提取出以下关键信息：
1. 合同编号 (contractNumber): 从中识别出关联的合同号或项目号（如 GD2025030101 等）。
2. 发货日期 (shipDate): 识别出具体的发货日期，格式为 YYYY-MM-DD。
3. 请简要列出主要的发货清单或描述。

请务必遵守此 JSON 格式进行返回，不要带有任何额外的 Markdown 代码块包装标记：
{
  "contractNumber": "...",
  "shipDate": "YYYY-MM-DD" | null,
  "description": "..."
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

        // 仅处理第一页做发货单识别
        const page = await pdfDocument.getPage(1)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvasInstance = canvas.createCanvas(viewport.width, viewport.height)
        const context = canvasInstance.getContext('2d')
        await page.render({ canvasContext: context, viewport: viewport }).promise
        base64Images.push(canvasInstance.toBuffer('image/jpeg').toString('base64'))
    } else {
        base64Images.push(buffer.toString('base64'))
    }

    const content = [
        { type: "text", text: "请精准识别出这份发货单/送货单中的文字内容。直接返回全部文字。" },
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

    if (!response.ok) throw new Error(`SiliconFlow VLM Error: ${await response.text()}`)
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
                { role: "system", content: "你是一个专业的发货文档解析专家。请根据原文提取 JSON。" },
                { role: "user", content: `文本内容：\n\n${rawText}\n\n${SHIPMENT_PROMPT}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    })
    const resData = await response.json()
    return resData.choices[0]?.message?.content || ""
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get("file") as File
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 1. OCR 识别与结构化
        const rawText = await extractOCRWithSiliconFlow(buffer, file.type, file.name)
        const jsonText = await refineJSONWithDeepSeek(rawText)
        const cleanJson = jsonText.replace(/```json\s*|\s*```/g, '').trim()
        const parsedData = JSON.parse(cleanJson)

        // 2. 匹配项目
        const contractNumber = parsedData.contractNumber?.trim()
        const consigneeOrBuyer = (parsedData.consignee || parsedData.buyerName || '').trim()

        // 使用精确匹配合同号
        const project = await (prisma.project as any).findFirst({
            where: { contractNumber: contractNumber },
            include: { client: true }
        })

        // 验证逻辑：如果合同号匹配，还需要核对客户名称
        let isMatchConfirmed = false
        if (project) {
            const clientName = project.client?.name || ""
            // 如果两个名字中有一个包含了另一个的核心关键词 (排除长度小于2的词)
            const docKeywords = consigneeOrBuyer.split(/[\s,，、]+/).filter((k: string) => k.length >= 2)
            const clientKeywords = clientName.split(/[\s,，、]+/).filter((k: string) => k.length >= 2)

            const hasKeywordOverlap = docKeywords.some((dk: string) => clientName.includes(dk)) ||
                clientKeywords.some((ck: string) => consigneeOrBuyer.includes(ck)) ||
                consigneeOrBuyer.includes(clientName) ||
                clientName.includes(consigneeOrBuyer)

            if (hasKeywordOverlap) {
                isMatchConfirmed = true
            }
        }

        if (!project || !isMatchConfirmed) {
            // 如果未匹配到项目或客户名称核对失败，触发冲突
            const reason = !project
                ? `未找到合同号为 ${contractNumber} 的关联项目`
                : `合同号匹配成功(${contractNumber})，但识别到的收货方/购方 "${consigneeOrBuyer}" 与项目客户 "${project.client?.name}" 不一致`

            const tempDir = path.join(process.cwd(), "public/uploads/temp")
            await mkdir(tempDir, { recursive: true })
            const ext = path.extname(file.name)
            const tempFileName = `temp_shipment_${Date.now()}${ext}`
            const tempFilePath = path.join(tempDir, tempFileName)
            await writeFile(tempFilePath, buffer)

            return NextResponse.json({
                collision: true,
                reason: reason,
                parsed: {
                    ...parsedData,
                    type: 'shipment',
                    fileName: file.name,
                    tempFilePath: tempFilePath,
                    fileUrl: `/uploads/temp/${tempFileName}`
                }
            })
        }

        // 3. 保存文件到本地
        const uploadDir = path.join(process.cwd(), "public/uploads/shipments")
        await mkdir(uploadDir, { recursive: true })
        const ext = path.extname(file.name)
        const fileName = `${project.id}_shipment_${Date.now()}${ext}`
        const filePath = path.join(uploadDir, fileName)
        const publicUrl = `/uploads/shipments/${fileName}`

        await writeFile(filePath, buffer)

        // 4. 更新数据库
        await (prisma.project as any).update({
            where: { id: project.id },
            data: {
                shipmentDocName: file.name,
                shipmentDocUrl: publicUrl,
                // 更新项目交付日期为发货日期
                delivery: parsedData.shipDate ? new Date(parsedData.shipDate) : new Date()
            }
        })

        // 更新项目下的所有设备发货状态
        await prisma.device.updateMany({
            where: { projectId: project.id },
            data: { shipmentAck: parsedData.shipDate ? new Date(parsedData.shipDate) : new Date() }
        })

        return NextResponse.json({
            success: true,
            projectId: project.id,
            projectName: project.name,
            parsed: parsedData
        })

    } catch (error: any) {
        console.error("Parse Shipment Error:", error)
        return NextResponse.json({ error: error.message || "解析失败" }, { status: 500 })
    }
}
