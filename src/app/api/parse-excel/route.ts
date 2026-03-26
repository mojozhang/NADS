import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"
import * as XLSX from "xlsx"

/**
 * 解析 Excel 采购清单并批量入库
 * 支持三个 Sheet: 标准件 / 机加工 / 外协
 * 自动跳过标题行，定位真正的列头
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get("file") as File
        const deviceId = formData.get("deviceId") as string

        if (!file || !deviceId) {
            return NextResponse.json({ error: "缺少文件或设备ID" }, { status: 400 })
        }

        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: "array" })

        const results = {
            standard: 0,
            machined: 0,
            outsourced: 0,
            electrical: 0,
            skippedSheets: [] as string[]
        }

        // 验证设备是否存在
        const device = await prisma.device.findUnique({ where: { id: deviceId } })
        if (!device) {
            return NextResponse.json({ error: "设备不存在" }, { status: 404 })
        }

        // 稍后在所有数据解析完毕后，于 $transaction 中清除旧数据并插入新数据
        const allPartsToCreate: any[] = []

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName]

            // 判断 Sheet 类型（优先通过 Sheet 名称）
            let type: string | null = null
            const nameStr = sheetName
            if (nameStr.includes("标准") || nameStr.includes("standard")) {
                type = "standard"
            } else if (nameStr.includes("机加工") || nameStr.includes("机加") || nameStr.includes("machined")) {
                type = "machined"
            } else if (nameStr.includes("外协") || nameStr.includes("外发") || nameStr.includes("outsource")) {
                type = "outsourced"
            } else if (nameStr.includes("电气") || nameStr.includes("电控") || nameStr.includes("electrical")) {
                type = "electrical"
            }

            // 如果 Sheet 名字并没有明确指明类型（比如叫 Sheet1），则尝试从整个文件的文件名来推断
            if (!type) {
                const fileName = file.name || ""
                if (fileName.includes("标准") || fileName.includes("standard")) {
                    type = "standard"
                } else if (fileName.includes("机加工") || fileName.includes("机加") || fileName.includes("machined")) {
                    type = "machined"
                } else if (fileName.includes("外协") || fileName.includes("外发") || fileName.includes("outsource")) {
                    type = "outsourced"
                } else if (fileName.includes("电气") || fileName.includes("电控") || fileName.includes("electrical")) {
                    type = "electrical"
                }
            }

            // 将 Sheet 转为二维数组，逐行查找列头
            const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
            if (rawData.length < 2) {
                if (!type) results.skippedSheets.push(sheetName)
                continue
            }

            // 查找列头行：包含 "名称" 关键字的行
            let headerRowIdx = -1
            let headerRow: string[] = []
            for (let i = 0; i < Math.min(rawData.length, 10); i++) {
                const row = rawData[i].map((c: any) => String(c).trim())
                if (row.some((c: string) => c === "名称" || c === "Name")) {
                    headerRowIdx = i
                    headerRow = row
                    break
                }
            }

            if (headerRowIdx === -1) {
                // 通过列头推断 Sheet 类型
                if (!type) results.skippedSheets.push(sheetName)
                continue
            }

            // 如果还没确定 type，通过列头内容判断
            if (!type) {
                const headStr = headerRow.join(",")
                if (headStr.includes("供应商") || headStr.includes("单价")) {
                    type = "standard"
                } else if (headStr.includes("零件编号")) {
                    type = "machined"
                } else {
                    results.skippedSheets.push(sheetName)
                    continue
                }
            }

            // 构建列名 -> 索引映射
            const colMap: Record<string, number> = {}
            headerRow.forEach((h, idx) => {
                if (h) colMap[h] = idx
            })

            const getVal = (row: any[], ...keys: string[]): string => {
                for (const k of keys) {
                    // 精确匹配
                    if (colMap[k] !== undefined && row[colMap[k]] !== undefined) {
                        const v = String(row[colMap[k]]).trim()
                        if (v) return v
                    }
                }
                // 模糊匹配
                for (const k of keys) {
                    for (const [colName, idx] of Object.entries(colMap)) {
                        if (colName.includes(k) && row[idx] !== undefined) {
                            const v = String(row[idx]).trim()
                            if (v) return v
                        }
                    }
                }
                return ""
            }

            const parseDate = (val: any): Date | null => {
                if (!val) return null
                const str = String(val).trim()
                if (!str) return null
                // Excel 日期序列号
                if (typeof val === "number" || /^\d{5}$/.test(str)) {
                    const num = typeof val === "number" ? val : parseInt(str)
                    const d = XLSX.SSF.parse_date_code(num)
                    if (d) return new Date(d.y, d.m - 1, d.d)
                }
                // yyyy/M/d 或 yyyy-M-d
                const parsed = new Date(str.replace(/\//g, "-"))
                return isNaN(parsed.getTime()) ? null : parsed
            }

            const partsToCreate: any[] = []
            // 遍历数据行
            for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                const row = rawData[i]
                const name = getVal(row, "名称", "Name")
                if (!name) continue
                // 跳过汇总/备注行
                if (name.includes("增补") || name.includes("改进") || name.includes("设计责任人")) continue

                const partData: any = {
                    deviceId,
                    name,
                    type,
                    quantity: parseInt(getVal(row, "数量", "Qty")) || 1,
                    material: getVal(row, "材料", "材料/品牌", "材料/品号") || null,
                    remark: getVal(row, "备注") || null,
                    isStocked: false,
                    status: "pending"
                }

                if (type === "standard") {
                    partData.supplier = getVal(row, "供应商") || null
                    partData.spec = getVal(row, "尺寸规格", "规格") || null
                    partData.unitPrice = parseFloat(getVal(row, "单价")) || null
                    partData.actualCost = parseFloat(getVal(row, "小计")) || null
                    partData.issueDate = parseDate(getVal(row, "下单日期", "下单日") || null)
                    partData.arrivalDate = parseDate(getVal(row, "到货日期", "到货日") || null)
                    partData.invoiceInfo = getVal(row, "发票情况", "发票") || null
                } else {
                    partData.partNumber = getVal(row, "零件编号") || null
                    partData.issueDate = parseDate(getVal(row, "发放日期") || null)
                    partData.arrivalDate = parseDate(getVal(row, "到货日期") || null)
                    const stockVal = getVal(row, "入库")
                    partData.isStocked = stockVal === "✓" || stockVal === "√" || stockVal === "是" || stockVal === "1"
                }

                partsToCreate.push(partData)
            }

            if (partsToCreate.length > 0) {
                allPartsToCreate.push(...partsToCreate)
                if (type === 'standard') results.standard += partsToCreate.length
                else if (type === 'machined') results.machined += partsToCreate.length
                else if (type === 'outsourced') results.outsourced += partsToCreate.length
                else if (type === 'electrical') results.electrical += partsToCreate.length
            }
        }

        // 使用事务：先删除再创建，防止因异常抛出导致数据永久丢失
        try {
            await prisma.$transaction([
                prisma.part.deleteMany({ where: { deviceId } }),
                ...(allPartsToCreate.length > 0 ? [prisma.part.createMany({ data: allPartsToCreate })] : [])
            ])
        } catch (e: any) {
            console.error("Failed to batch insert parts in transaction:", e.message)
            return NextResponse.json({ error: "批量插入数据失败，请检查数据格式" }, { status: 500 })
        }

        const total = results.standard + results.machined + results.outsourced + results.electrical
        return NextResponse.json({
            success: true,
            message: `导入完成！共 ${total} 条：标准件 ${results.standard} 条，机加 ${results.machined} 条，外协 ${results.outsourced} 条，电气 ${results.electrical} 条`,
            results,
            sheetsFound: workbook.SheetNames
        })
    } catch (error: any) {
        console.error("Excel parse error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
