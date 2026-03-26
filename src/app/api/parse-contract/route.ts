import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"

// ========== 硅基流动配置 (SiliconFlow) ==========
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || ""
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ========== 合同解析 Prompt ==========
const CONTRACT_PROMPT = `请分析这份上传的文件内容（合同、发票计划书、技术协议等）。请从中提取出以下结构化的关键信息：
1. 文档类型 (documentType): 如果是产品合同、技术协议、采购协议、报价单等，填 "contract"；如果是增值税发票、电子发票等，填 "invoice"；如果是其他，填 "other"。
2. 客户名称 (合同中的对方公司名称。注意：如果合同中有两方，请选择 **不是** "上海高得自动化设备有限公司" 的那个公司名称作为客户名称。如果无法找到则返回 "未知客户")
3. 关于采购协议或合同约定的付款方式 (例如 "预付30%，发货前发清" 等。没找到就留空)
4. 发票开具情况 (例如 "13%增值税专用发票" 等，没找到就留空)
5. 全局的或针对设备的交货期条款（需原样提取文字描述，例如："合同签订后30日内发货" 或 "预付款到账后45天交付" 或 "2026年5月1日必须交货"等，若无则留空）
6. **核心逻辑拆解**：针对提取出的交货期条款，请进一步拆解：
   - deliveryType: 如果明确提到 "工作日"，填 "workday"；如果是 "天" 或 "日" 且未提工作日，或者提到 "自然日"，填 "natural"；如果是具体日期（如2025-10-1 或 3月15日），填 "absolute"。
   - deliveryDays: 提取数字天数（如 30）。如果是具体日期，填 null。
   - deliveryTrigger: 如果是合同签订/生效起算，填 "contract"；如果是预付款/首款到账起算，填 "downpayment"；如果是具体日期，填 "none"。
   - **重要：如果日期只有月日（如 3月15日），请结合“合同签订日期”的年份，补全为 YYYY-MM-DD 格式返回。**
7. 合同签订日期（从合同中找到实际的签订日期或生效日期，格式为 YYYY-MM-DD，如 "2025-03-01"。如未找到则返回 null）
8. 合同总金额（从合同中找到总金额或总价，返回纯数字，不带货币符号。如 150000.00。如未找到则返回 null）
9. 当前文档包含的主要设备及相关信息列表。对于每一台设备：
   - 设备品类名称 (Category)
   - 数量 (数字)
   - 价格 (数字，如果没写则为空)
   - 针对设备的额外技术交期 (如果没有特殊约定就是同上总交期)
   - 针对该项目中该设备的不同技术要点总结 (请提炼成一个总结性的 Markdown 格式文本，包含所有关键技术要求和核心参数。越详细、排版越好越好)。

请务必遵守此 JSON 格式进行返回，不要带有任何额外的 Markdown 代码块包装标记(例如 \`\`\`json)：
{
  "documentType": "contract" | "invoice" | "other",
  "clientName": "...",
  "paymentTerm": "...",
  "invoiceStatus": "...",
  "deliveryRaw": "...",
  "deliveryType": "natural" | "workday" | "absolute",
  "deliveryDays": number | null,
  "deliveryTrigger": "contract" | "downpayment" | "none",
  "contractSignDate": "YYYY-MM-DD" | null,
  "totalAmount": number | null,
  "devices": [
    {
       "category": "...",
       "quantity": 1,
       "price": 100000.0,
       "delivery": "...",
       "techSpecs": "..."
    }
  ]
}`

// ========== 阶段一：尝试从 PDF 提取文字 (Fast Track) ==========
async function extractTextFromPDF(buffer: Buffer, selectedPages: number[] | null): Promise<string> {
    try {
        console.log("[Contract Parse] Fast Track: Attempting to extract text layer...")
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
        const data = new Uint8Array(buffer)
        const pdfDocument = await pdfjsLib.getDocument({ data }).promise

        // 使用前端传来的页码，如果没传则默认前3页
        const pagesToProcess = selectedPages || Array.from({ length: Math.min(pdfDocument.numPages, 3) }, (_, i) => i + 1)

        let fullText = ""
        for (const pageNum of pagesToProcess) {
            if (pageNum > pdfDocument.numPages) continue
            const page = await pdfDocument.getPage(pageNum)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map((item: any) => item.str).join(' ')
            fullText += `--- 第 ${pageNum} 页 ---\n${pageText}\n\n`
        }
        return fullText.trim()
    } catch (e) {
        console.error("[Contract Parse] Fast Track text extraction failed:", e)
        return ""
    }
}

// ========== 阶段二：使用 Qwen2.5-VL 处理视觉/图片文字提取 (扫描件模式) ==========
async function extractOCRWithSiliconFlow(buffer: Buffer, originalMimeType: string, fileName: string, selectedPages: number[] | null): Promise<string> {
    if (!SILICONFLOW_API_KEY) throw new Error("SILICONFLOW_API_KEY 未配置")

    const mimeType = originalMimeType
    const isPDF = fileName.toLowerCase().endsWith(".pdf") || mimeType.includes("pdf")

    const base64Images: string[] = []

    if (isPDF) {
        console.log("[Contract Parse] Rendering PDF to Images for SiliconFlow OCR...")
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const canvas = require('canvas')
        const data = new Uint8Array(buffer)
        const pdfDocument = await pdfjsLib.getDocument({ data }).promise

        // 使用前端传来的页码，如果没传则默认前2页
        const pagesToProcess = selectedPages || [1, 2]

        for (const pageNum of pagesToProcess) {
            if (pageNum > pdfDocument.numPages) continue
            console.log(`[Contract Parse] Rendering Page ${pageNum}...`)
            const page = await pdfDocument.getPage(pageNum)
            const viewport = page.getViewport({ scale: 1.5 })
            const canvasInstance = canvas.createCanvas(viewport.width, viewport.height)
            const context = canvasInstance.getContext('2d')
            await page.render({ canvasContext: context, viewport: viewport }).promise
            base64Images.push(canvasInstance.toBuffer('image/jpeg').toString('base64'))
        }
    } else {
        base64Images.push(buffer.toString('base64'))
    }

    if (base64Images.length === 0) throw new Error("未能生成解析所需的图像")

    // 构造 VLM 请求内容 (硅基流动 VLM 支持一次传多图)
    const content = [
        { type: "text", text: "请精准识别出这份合同/图片中的所有文字内容，特别是涉及设备名称、交货期、金额、公司名称等条款。直接返回识别出的文字内容，尽量保持原始排版。" },
        ...base64Images.map(img => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${img}` }
        }))
    ]

    console.log(`[Contract Parse] Calling SiliconFlow Qwen2.5-VL-7B...`)
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
            max_tokens: 4096
        })
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`SiliconFlow VLM Error: ${err}`)
    }

    const resData = await response.json()
    return resData.choices[0]?.message?.content || ""
}

// ========== 阶段三：使用 DeepSeek 将杂乱文字转化为结构化 JSON ==========
async function refineJSONWithDeepSeek(rawText: string): Promise<string> {
    console.log(`[Contract Parse] Calling SiliconFlow DeepSeek-V3 for refinement...`)
    const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            messages: [
                { role: "system", content: "你是一个专业的合同数据解析专家。你的任务是根据提供的原始文字，提取出指定的结构化 JSON 数据。" },
                { role: "user", content: `以下是合同的原始文本内容：\n\n${rawText}\n\n${CONTRACT_PROMPT}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`SiliconFlow DeepSeek Error: ${err}`)
    }

    const resData = await response.json()
    return resData.choices[0]?.message?.content || ""
}

// ========== 主路由 ==========
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get("file") as File
        const selectedPagesRaw = formData.get("selectedPages") as string
        const selectedPages: number[] | null = selectedPagesRaw ? JSON.parse(selectedPagesRaw) : null

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const isPDF = file.type.includes("pdf")

        // 1. 获取内容 (Fast Track vs VLM)
        let rawText = ""

        if (isPDF) {
            rawText = await extractTextFromPDF(buffer, selectedPages)
            if (rawText.replace(/\s+/g, '').length < 50) {
                rawText = await extractOCRWithSiliconFlow(buffer, file.type, file.name, selectedPages)
            }
        } else {
            rawText = await extractOCRWithSiliconFlow(buffer, file.type, file.name, selectedPages)
        }

        const jsonText = await refineJSONWithDeepSeek(rawText)
        const cleanText = jsonText.replace(/```jsons*|s*```/g, '').trim()
        const parsedData = JSON.parse(cleanText)

        const clientName = (parsedData.buyerName || '').trim()
        let client = await prisma.client.findFirst({ where: { name: clientName } })
        if (!client) { client = await prisma.client.create({ data: { name: clientName } }) }

        const result = await prisma.$transaction(async (tx) => {
            const signDate = parsedData.contractSignDate ? new Date(parsedData.contractSignDate) : new Date()
            const dateStr = `${signDate.getFullYear()}${String(signDate.getMonth() + 1).padStart(2, '0')}${String(signDate.getDate()).padStart(2, '0')}`
            const cnPrefix = `GD${dateStr}`

            // 查找当天最大的编号并递增（事务保护防止竞态）
            const existingCN = await (tx as any).project.findMany({
                where: { contractNumber: { startsWith: cnPrefix } },
                select: { contractNumber: true },
                orderBy: { contractNumber: 'desc' },
                take: 1
            })

            let cnSeq = 1
            if (existingCN.length > 0 && existingCN[0].contractNumber) {
                const lastSeq = parseInt(existingCN[0].contractNumber.slice(-2))
                if (!isNaN(lastSeq)) cnSeq = lastSeq + 1
            }
            const contractNumber = `${cnPrefix}${String(cnSeq).padStart(2, '0')}`

            const project = await (tx as any).project.create({
                data: {
                    clientId: client.id,
                    name: clientName,
                    contractNumber,
                    amount: parsedData.totalAmount || null,
                    paymentTerm: parsedData.paymentTerm,
                    deliveryRaw: parsedData.deliveryRaw,
                    deliveryType: parsedData.deliveryType || "natural",
                    deliveryDays: parsedData.deliveryDays || null,
                    deliveryTrigger: parsedData.deliveryTrigger || "contract",
                    delivery: (() => {
                        if (parsedData.deliveryType !== "absolute" || !parsedData.deliveryRaw) return null;
                        const stdMatch = parsedData.deliveryRaw.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})[日]?/);
                        if (stdMatch) {
                            return new Date(`${stdMatch[1]}-${stdMatch[2].padStart(2, '0')}-${stdMatch[3].padStart(2, '0')}`);
                        }
                        const shortMatch = parsedData.deliveryRaw.match(/(\d{1,2})[月\.\/](\d{1,2})[日]?/);
                        if (shortMatch) {
                            const year = signDate.getFullYear();
                            return new Date(`${year}-${shortMatch[1].padStart(2, '0')}-${shortMatch[2].padStart(2, '0')}`);
                        }
                        return null;
                    })(),
                    contractSignDate: parsedData.contractSignDate ? new Date(parsedData.contractSignDate) : null,
                }
            })

            if (parsedData.devices && Array.isArray(parsedData.devices)) {
                let deviceSeq = 1
                for (const d of parsedData.devices) {
                    await tx.device.create({
                        data: {
                            projectId: project.id,
                            deviceNumber: `${contractNumber}-${String(deviceSeq++).padStart(2, '0')}`,
                            category: d.category || "未命名设备",
                            quantity: d.quantity || 1,
                            price: d.price || null,
                            techSpecs: `${d.techSpecs}\n\n**附件协议/要求:** ${d.delivery}\n**发票描述:** ${parsedData.invoiceStatus}`
                        }
                    })
                }
            }

            return project
        })

        return NextResponse.json({ success: true, message: "硅基流动解析成功", data: parsedData, projectId: result.id })

    } catch (error: any) {
        console.error("SiliconFlow API Error:", error)
        return NextResponse.json({ error: error.message || "Failed to parse document" }, { status: 500 })
    }
}
