import { NextResponse } from "next/server"
import ExcelJS from "exceljs"

export async function GET() {
    const wb = new ExcelJS.Workbook()

    const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } }
    const allBorders: Partial<ExcelJS.Borders> = {
        top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder
    }
    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FF374151' } }

    const applyHeaderStyle = (row: ExcelJS.Row) => {
        row.eachCell((cell) => {
            cell.fill = headerFill
            cell.font = headerFont
            cell.border = allBorders
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
        })
        row.height = 22
    }

    // 标准件 Sheet
    const ws1 = wb.addWorksheet('标准件')
    applyHeaderStyle(ws1.addRow(['序号', '供应商', '名称', '材料/品牌', '尺寸规格(mm)', '下单日期', '到货日期', '数量', '单价', '小计', '备注', '发票', '入库']))
    // 添加几行空行方便填写
    for (let i = 0; i < 20; i++) {
        const row = ws1.addRow(['', '', '', '', '', '', '', '', '', '', '', '', ''])
        row.eachCell((cell) => { cell.border = allBorders })
    }
    ws1.columns = [
        { width: 6 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 16 },
        { width: 12 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 12 },
        { width: 16 }, { width: 6 }, { width: 6 }
    ]

    // 机加工 Sheet
    const ws2 = wb.addWorksheet('机加工')
    applyHeaderStyle(ws2.addRow(['序号', '零件编号', '名称', '材料', '发放日期', '到货日期', '数量', '单价', '小计', '入库', '备注']))
    for (let i = 0; i < 20; i++) {
        const row = ws2.addRow(['', '', '', '', '', '', '', '', '', '', ''])
        row.eachCell((cell) => { cell.border = allBorders })
    }
    ws2.columns = [
        { width: 6 }, { width: 14 }, { width: 18 }, { width: 14 },
        { width: 12 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 12 },
        { width: 6 }, { width: 16 }
    ]

    // 外协 Sheet
    const ws3 = wb.addWorksheet('外协')
    applyHeaderStyle(ws3.addRow(['序号', '零件编号', '名称', '材料', '发放日期', '到货日期', '数量', '单价', '小计', '入库', '备注']))
    for (let i = 0; i < 20; i++) {
        const row = ws3.addRow(['', '', '', '', '', '', '', '', '', '', ''])
        row.eachCell((cell) => { cell.border = allBorders })
    }
    ws3.columns = [
        { width: 6 }, { width: 14 }, { width: 18 }, { width: 14 },
        { width: 12 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 12 },
        { width: 6 }, { width: 16 }
    ]

    // 电气 Sheet
    const ws4 = wb.addWorksheet('电气')
    applyHeaderStyle(ws4.addRow(['序号', '零件编号', '名称', '材料', '发放日期', '到货日期', '数量', '单价', '小计', '入库', '备注']))
    for (let i = 0; i < 20; i++) {
        const row = ws4.addRow(['', '', '', '', '', '', '', '', '', '', ''])
        row.eachCell((cell) => { cell.border = allBorders })
    }
    ws4.columns = [
        { width: 6 }, { width: 14 }, { width: 18 }, { width: 14 },
        { width: 12 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 12 },
        { width: 6 }, { width: 16 }
    ]

    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('采购清单模板.xlsx')}`,
        }
    })
}
