import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import prisma from "@/lib/prisma/client"

// ========== 双引擎配置 ==========
// 主引擎: NVIDIA DeepSeek 3.2 (文本分析，更擅长逻辑拆解与推理)
// 视觉引擎: Gemini (视觉 OCR 提取图纸中的几何特征与技术要求)
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || ""
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEEPSEEK_MODEL = "deepseek-ai/deepseek-r1"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ========== NVIDIA DeepSeek API 调用 ==========
async function callDeepSeek(prompt: string): Promise<string> {
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: [
                {
                    role: "system",
                    content: "你是一个资深的非标自动化机械加工及成本核算工程师。请务必以纯 JSON 格式返回结果，禁止输出 markdown 标记、思维链标签（如 <think>）或其他不相关文字。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 4096
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`NVIDIA API Error [${response.status}]: ${errorText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ""
}

// ========== Gemini 视觉模型提取图纸详细特征 ==========
async function extractDrawingFeaturesVisually(buffer: Buffer, originalMimeType: string, fileName: string): Promise<string | null> {
    const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-flash-latest", "gemini-2.0-flash-lite"]

    // 智能推断 mimeType
    let mimeType = originalMimeType
    if (!mimeType || mimeType === "application/octet-stream") {
        if (fileName.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf"
        else if (fileName.toLowerCase().match(/\.(jpg|jpeg)$/)) mimeType = "image/jpeg"
        else if (fileName.toLowerCase().endsWith(".png")) mimeType = "image/png"
        else mimeType = "application/pdf" // default fallback
    }

    const ocrPrompt = `作为一位专业的机械制图与工艺审核员，请仔细观察这张机械加工图纸（这可能是 PDF 或图片），提取并描述以下关键加工信息：
1. 【基础信息】零件名称、材质要求、数量要求。
2. 【几何特征】描述零件的主要宏观形状（如轴类、盘类、箱体、异形件等），以及关键部位的尺寸（大致长宽厚或直径）。
3. 【加工难点】指出图纸上的特殊结构：例如深孔、复杂的曲面、细长轴、薄壁结构等。
4. 【精度与公差】列出图中标记的较高精度的尺寸公差、形位公差（如垂直度、同轴度等）。
5. 【表面质量与热处理】列出粗糙度要求（如 Ra1.6, Ra0.8）、表面处理（如发黑、阳极氧化）以及热处理要求（如淬火、调质等）。
6. 【技术要求】完整转述图纸中纯文字部分的“技术要求”或“技术说明”。

请用详实、专业的中文工程语言，输出一段完整的文本描述。不要试图在这里做成本核算，你的任务是完美“转述”这张视觉图纸蕴含的所有机械加工特征。`

    const filePart = {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType: mimeType
        }
    }

    let lastErrorMessage = ""
    // 轮询尝试可用的视觉模型
    for (const modelName of GEMINI_MODELS) {
        try {
            console.log(`[Vision Extraction] Trying Gemini ${modelName} with mimeType: ${mimeType}...`)
            const model = genAI.getGenerativeModel({ model: modelName })
            const result = await model.generateContent([ocrPrompt, filePart])
            const text = result.response.text().trim()
            if (text) {
                console.log(`[Vision Extraction] Success with ${modelName}`)
                return text
            }
        } catch (e: any) {
            console.error(`[Vision Extraction Error] ${modelName} request failed:`, e)
            lastErrorMessage = e?.message || "未知引擎错误"
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('fs').appendFileSync('/tmp/gemini_error.log', `\n[${new Date().toISOString()}] Model: ${modelName}, Mime: ${mimeType}\nError: ${e?.message}\nStack: ${e?.stack}\n`)
            } catch (err) { }

            if (e.message?.includes("429") || e.message?.includes("503")) {
                await sleep(2000)
            }
        }
    }

    // 如果全部挂掉，往外面抛出最后一个明确的错误帮助调试
    throw new Error(`视觉模型提取失败: ${lastErrorMessage}`)
}

// ========== NVIDIA Vision 兜底提取 (Llama 3.2 Vision) ==========
async function extractFeaturesFallbackNvidia(buffer: Buffer, originalMimeType: string, fileName: string): Promise<string | null> {
    if (!NVIDIA_API_KEY) {
        throw new Error("NVIDIA_API_KEY is missing for fallback")
    }

    let mimeType = originalMimeType
    if (!mimeType || mimeType === "application/octet-stream") {
        if (fileName.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf"
        else if (fileName.toLowerCase().match(/\.(jpg|jpeg)$/)) mimeType = "image/jpeg"
        else if (fileName.toLowerCase().endsWith(".png")) mimeType = "image/png"
        else mimeType = "application/pdf"
    }

    let base64Image = ""
    let finalMime = mimeType

    if (mimeType === "application/pdf") {
        console.log("[Phase 1 Fallback] Converting PDF to Image for Llama Vision...")
        // 动态引入 pdfjs-dist 防止由于服务端渲染报错
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const canvas = require('canvas')
        const data = new Uint8Array(buffer)
        const pdfDocument = await pdfjsLib.getDocument({ data }).promise
        const page = await pdfDocument.getPage(1)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvasInstance = canvas.createCanvas(viewport.width, viewport.height)
        const context = canvasInstance.getContext('2d')
        await page.render({ canvasContext: context, viewport: viewport }).promise
        base64Image = canvasInstance.toBuffer('image/jpeg').toString('base64')
        finalMime = "image/jpeg"
    } else {
        base64Image = buffer.toString('base64')
    }

    const ocrPrompt = `作为一位专业的机械制图与工艺审核员，请仔细观察这张机械加工图纸，提取并描述以下关键加工信息：
1. 【基础信息】零件名称、材质要求、数量要求。
2. 【几何特征】描述零件的主要宏观形状，以及关键部位的尺寸（大致长宽厚或直径）。
3. 【加工难点】指出图纸上的特殊结构：例如深孔、复杂的曲面、细长轴、薄壁结构等。
4. 【精度与公差】列出图中标记的较高精度的尺寸公差、形位公差。
5. 【表面质量与热处理】列出粗糙度要求、表面处理以及热处理要求。
6. 【技术要求】完整转述图纸中纯文字部分的“技术要求”或“技术说明”。

请用详实、专业的中文工程语言，输出一段完整的文本描述。不要试图在这里做成本核算，你的任务是完美“转述”这张视觉图纸蕴含的所有机械加工特征。`

    console.log(`[Phase 1 Fallback] Calling NVIDIA Llama 3.2 90B Vision...`)
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
            model: "meta/llama-3.2-90b-vision-instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: ocrPrompt },
                        { type: "image_url", image_url: { url: `data:${finalMime};base64,${base64Image}` } }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 2048
        })
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`NVIDIA Vision API Error: ${err}`)
    }

    const resData = await response.json()
    return resData.choices[0]?.message?.content || null
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
        const partId = formData.get("partId") as string
        const rates = JSON.parse(formData.get("rates") as string || "{}")

        if (!file || !partId) {
            return NextResponse.json({ error: "Missing file or partId" }, { status: 400 })
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // ====== 阶段一：使用视觉模型提取几何与工艺特征 ======
        console.log("[Phase 1] Extracting visual features...")
        // 传递 file.name 以便智能推断 mimeType
        let drawingFeatures: string | null = null;
        try {
            drawingFeatures = await extractDrawingFeaturesVisually(buffer, file.type, file.name)
        } catch (e: any) {
            const msg = e.message || ""
            if (msg.includes("429") || msg.includes("503") || msg.includes("500")) {
                console.log("[Phase 1] Gemini failed due to limits/errors, falling back to NVIDIA Llama 3.2 Vision...")
                try {
                    drawingFeatures = await extractFeaturesFallbackNvidia(buffer, file.type, file.name)
                } catch (fallbackError: any) {
                    console.error("[Phase 1 Fallback] NVIDIA Llama Vision also failed:", fallbackError)
                    return NextResponse.json({
                        error: "所有视觉引擎配额均已耗尽",
                        suggestion: "Gemini 和备用 NVIDIA 图像引擎均拒绝服务，请稍后再试。"
                    }, { status: 429 })
                }
            } else {
                return NextResponse.json({
                    error: "视觉识别引擎报错",
                    suggestion: msg.substring(0, 200)
                }, { status: 500 })
            }
        }

        if (!drawingFeatures) {
            return NextResponse.json({
                error: "无法识别图纸的视觉特征",
                suggestion: "请确保图纸清晰度足够，且包含尺寸文字。"
            }, { status: 422 })
        }

        // ====== 阶段二：使用推理引擎 (DeepSeek) 进行工序拆解与成本估算 ======
        const analysisPrompt = `以下是你作为工艺成本核算员收到的零件图纸特征描述。这份描述由前置的视觉识别模块生成，包含了该零件的形状、公差、材质及技术要求：

---
${drawingFeatures}
---

请基于这些信息进行深度分析与工艺拆解：

1. 提炼【零件名称】
2. 提炼【材料名称及规格】
3. 核算【预估材料费】（人民币）。需根据材料牌号、大概体积/重量结合市场行情合理估算。
4. 核算【加工工序及工时】（单位：小时）。
   - 必须涵盖从毛坯到成品的完整工序流。
   - 常见工序包括：下料、钻床、铣床、车床、加工中心(CNC)、线切割、热处理、表面处理、磨床、钳工。
   - **工时估算要结合图纸描述中的难点**（如精度要求极高需要增加磨床或极慢进给；有形位公差说明装夹困难）。

请严格遵守纯 JSON 格式输出，请勿使用 \`\`\`json 等任何包裹，格式如下：
{
  "name": "零件名称",
  "material": "材料名称及规格",
  "materialCost": 0.0,
  "processes": [
    { "name": "下料", "hours": 0.2 },
    { "name": "加工中心(CNC)", "hours": 3.5 }
  ]
}`

        let responseText = ""
        let usedEngine = ""
        const extractionMethod = "Gemini Vision"

        // 主推理引擎：DeepSeek
        if (NVIDIA_API_KEY) {
            try {
                console.log("[Phase 2] Cost Analysis by DeepSeek (NVIDIA)...")
                responseText = await callDeepSeek(analysisPrompt)
                usedEngine = "NVIDIA DeepSeek R1"
            } catch (e: any) {
                console.warn("[Phase 2] DeepSeek failed, falling back...", e.message)
            }
        }

        // 备用推理引擎：如果 DeepSeek 失败，用 Gemini 自身完成后续核算
        if (!responseText) {
            console.log("[Phase 2] Cost Analysis by Gemini (Fallback)...")
            const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-flash-latest"]
            for (const modelName of GEMINI_MODELS) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName })
                    // Gemini 往往需要在 prompt 里反复强调纯 JSON
                    const result = await model.generateContent(`${analysisPrompt}\n\n注意：只要JSON，不要其他废话。`)
                    responseText = result.response.text().trim()
                    if (responseText) {
                        usedEngine = `Gemini (${modelName})`
                        break
                    }
                } catch (e: any) {
                    console.warn(`[Phase 2] Gemini fallback failed: ${e.message}`)
                }
            }
        }

        if (!responseText) {
            return NextResponse.json({
                error: "AI 成本核算引擎目前繁忙，请稍后再试",
            }, { status: 503 })
        }

        // ====== 阶段三：JSON 清洗与解析 ======
        let aiData
        try {
            // 清理 DeepSeek 可能输出的 think 标签以及 Markdown block
            let cleanText = responseText
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/```json\s*|\s*```/g, '')
                .trim()

            // 安全提取可能存在的嵌套 JSON
            const jsonStart = cleanText.indexOf('{')
            const jsonEnd = cleanText.lastIndexOf('}')
            if (jsonStart !== -1 && jsonEnd !== -1) {
                cleanText = cleanText.substring(jsonStart, jsonEnd + 1)
            }
            aiData = JSON.parse(cleanText)
        } catch (e) {
            console.error("AI Response Parse Error. Raw:\n", responseText.substring(0, 300))
            return NextResponse.json({ error: "AI 格式化错误，请尝试重新分析", raw: responseText.substring(0, 200) }, { status: 500 })
        }

        // ====== 阶段四：费用结合 ======
        let laborCost = 0
        const processDetails = (aiData.processes || []).map((p: any) => {
            const rate = rates[p.name] || rates['其他'] || 0
            const cost = (p.hours || 0) * rate
            laborCost += cost
            return { ...p, rate, cost }
        })

        const totalEstCost = (aiData.materialCost || 0) + laborCost

        // ====== 阶段五：数据库持久化 ======
        const storageData = {
            aiSuggestedName: aiData.name,
            aiSuggestedMaterial: aiData.material,
            processes: processDetails,
            analysisDate: new Date().toISOString(),
            engine: usedEngine,
            extractionMethod,
            drawingFeaturesSummary: drawingFeatures.substring(0, 100) + '...' // 可选保存特征摘要
        }

        const updatedPart = await prisma.part.update({
            where: { id: partId },
            data: {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                estMaterialCost: aiData.materialCost || 0,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                estLaborCost: laborCost,
                estProcessInfo: JSON.stringify(storageData)
            }
        })

        return NextResponse.json({
            success: true,
            data: {
                part: updatedPart,
                aiAnalysis: aiData,
                engine: usedEngine,
                calculation: {
                    materialCost: aiData.materialCost || 0,
                    laborCost,
                    total: totalEstCost
                }
            }
        })

    } catch (error: any) {
        console.error("Analysis API Fatal Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

