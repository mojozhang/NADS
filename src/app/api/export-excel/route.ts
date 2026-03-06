import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma/client";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (!deviceId) {
        return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const device = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { project: true } as any
    });
    if (!device) {
        return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const parts = await (prisma.part as any).findMany({
        where: { deviceId: deviceId },
        orderBy: { createdAt: "asc" },
    });

    const standard = parts.filter((p: any) => p.type === "standard");
    const machined = parts.filter((p: any) => p.type === "machined");
    const outsourced = parts.filter((p: any) => p.type === "outsourced");
    const electrical = parts.filter((p: any) => p.type === "electrical");

    const fmtDate = (d: any) => {
        if (!d) return "";
        const dt = new Date(d);
        return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
    };

    const wb = new ExcelJS.Workbook();

    const thinBorder: Partial<ExcelJS.Border> = {
        style: "thin",
        color: { argb: "FF999999" },
    };
    const allBorders: Partial<ExcelJS.Borders> = {
        top: thinBorder,
        bottom: thinBorder,
        left: thinBorder,
        right: thinBorder,
    };
    const headerFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
    };
    const headerFont: Partial<ExcelJS.Font> = {
        bold: true,
        size: 10,
        color: { argb: "FF374151" },
    };
    const totalFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
    };
    const totalFont: Partial<ExcelJS.Font> = {
        bold: true,
        size: 11,
        color: { argb: "FF1D4ED8" },
    };

    const applyBordersToSheet = (ws: ExcelJS.Worksheet) => {
        ws.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = allBorders;
                if (!cell.font?.bold) {
                    cell.font = { size: 10 };
                }
                cell.alignment = { vertical: "middle", wrapText: true };
            });
        });
    };

    // ========== 标准件 Sheet ==========
    {
        const ws = wb.addWorksheet("标准件");
        const headers = [
            "序号",
            "供应商",
            "名称",
            "材料/品牌",
            "尺寸规格(mm)",
            "下单日期",
            "到货日期",
            "数量",
            "单价",
            "小计",
            "备注",
            "发票",
            "入库",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = allBorders;
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        headerRow.height = 22;

        let totalCost = 0;
        standard.forEach((p: any, i: number) => {
            const qty = p.quantity || 1;
            const price = p.unitPrice || 0;
            const subtotal = qty * price;
            totalCost += subtotal;
            ws.addRow([
                i + 1,
                p.supplier || "",
                p.name || "",
                p.material || "",
                p.spec || "",
                fmtDate(p.issueDate),
                fmtDate(p.arrivalDate),
                qty,
                price,
                subtotal,
                p.remark || "",
                p.invoiceInfo ? "✓" : "",
                p.isStocked ? "✓" : "",
            ]);
        });

        // 合计行
        const totalRow = ws.addRow([
            "",
            "",
            "",
            "",
            "",
            "",
            "合计",
            "",
            "",
            totalCost,
            "",
            "",
            "",
        ]);
        totalRow.eachCell((cell, colNumber) => {
            cell.border = allBorders;
            if (colNumber === 7) {
                cell.font = totalFont;
                cell.alignment = { horizontal: "right", vertical: "middle" };
            }
            if (colNumber === 10) {
                cell.font = totalFont;
                cell.fill = totalFill;
                cell.numFmt = "#,##0.00";
            }
        });
        totalRow.height = 24;

        // 列宽
        ws.columns = [
            { width: 6 },
            { width: 14 },
            { width: 18 },
            { width: 14 },
            { width: 16 },
            { width: 12 },
            { width: 12 },
            { width: 8 },
            { width: 10 },
            { width: 12 },
            { width: 16 },
            { width: 6 },
            { width: 6 },
        ];
        applyBordersToSheet(ws);
    }

    // ========== 机加工 Sheet ==========
    {
        const ws = wb.addWorksheet("机加工");
        const headers = [
            "序号",
            "零件编号",
            "名称",
            "材料",
            "发放日期",
            "到货日期",
            "数量",
            "单价",
            "小计",
            "入库",
            "备注",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = allBorders;
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        headerRow.height = 22;

        let totalCost = 0;
        machined.forEach((p: any, i: number) => {
            const qty = p.quantity || 1;
            const price = p.unitPrice || 0;
            const subtotal = qty * price;
            totalCost += subtotal;
            ws.addRow([
                i + 1,
                p.partNumber || "",
                p.name || "",
                p.material || "",
                fmtDate(p.issueDate),
                fmtDate(p.arrivalDate),
                qty,
                price,
                subtotal,
                p.isStocked ? "✓" : "",
                p.remark || "",
            ]);
        });

        const totalRow = ws.addRow([
            "",
            "",
            "",
            "",
            "",
            "合计",
            "",
            "",
            totalCost,
            "",
            "",
        ]);
        totalRow.eachCell((cell, colNumber) => {
            cell.border = allBorders;
            if (colNumber === 6) {
                cell.font = totalFont;
                cell.alignment = { horizontal: "right", vertical: "middle" };
            }
            if (colNumber === 9) {
                cell.font = totalFont;
                cell.fill = totalFill;
                cell.numFmt = "#,##0.00";
            }
        });
        totalRow.height = 24;

        ws.columns = [
            { width: 6 },
            { width: 14 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 12 },
            { width: 8 },
            { width: 10 },
            { width: 12 },
            { width: 6 },
            { width: 16 },
        ];
        applyBordersToSheet(ws);
    }

    // ========== 外协 Sheet ==========
    {
        const ws = wb.addWorksheet("外协");
        const headers = [
            "序号",
            "零件编号",
            "名称",
            "材料",
            "发放日期",
            "到货日期",
            "数量",
            "单价",
            "小计",
            "入库",
            "备注",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = allBorders;
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        headerRow.height = 22;

        let totalCost = 0;
        outsourced.forEach((p: any, i: number) => {
            const qty = p.quantity || 1;
            const price = p.unitPrice || 0;
            const subtotal = qty * price;
            totalCost += subtotal;
            ws.addRow([
                i + 1,
                p.partNumber || "",
                p.name || "",
                p.material || "",
                fmtDate(p.issueDate),
                fmtDate(p.arrivalDate),
                qty,
                price,
                subtotal,
                p.isStocked ? "✓" : "",
                p.remark || "",
            ]);
        });

        const totalRow = ws.addRow([
            "",
            "",
            "",
            "",
            "",
            "合计",
            "",
            "",
            totalCost,
            "",
            "",
        ]);
        totalRow.eachCell((cell, colNumber) => {
            cell.border = allBorders;
            if (colNumber === 6) {
                cell.font = totalFont;
                cell.alignment = { horizontal: "right", vertical: "middle" };
            }
            if (colNumber === 9) {
                cell.font = totalFont;
                cell.fill = totalFill;
                cell.numFmt = "#,##0.00";
            }
        });
        totalRow.height = 24;

        ws.columns = [
            { width: 6 },
            { width: 14 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 12 },
            { width: 8 },
            { width: 10 },
            { width: 12 },
            { width: 6 },
            { width: 16 },
        ];
        applyBordersToSheet(ws);
    }

    // ========== 电气 Sheet ==========
    {
        const ws = wb.addWorksheet("电气");
        const headers = [
            "序号",
            "零件编号",
            "名称",
            "材料",
            "发放日期",
            "到货日期",
            "数量",
            "单价",
            "小计",
            "入库",
            "备注",
        ];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = allBorders;
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });
        headerRow.height = 22;

        let totalCost = 0;
        electrical.forEach((p: any, i: number) => {
            const qty = p.quantity || 1;
            const price = p.unitPrice || 0;
            const subtotal = qty * price;
            totalCost += subtotal;
            ws.addRow([
                i + 1,
                p.partNumber || "",
                p.name || "",
                p.material || "",
                fmtDate(p.issueDate),
                fmtDate(p.arrivalDate),
                qty,
                price,
                subtotal,
                p.isStocked ? "✓" : "",
                p.remark || "",
            ]);
        });

        const totalRow = ws.addRow([
            "",
            "",
            "",
            "",
            "",
            "合计",
            "",
            "",
            totalCost,
            "",
            "",
        ]);
        totalRow.eachCell((cell, colNumber) => {
            cell.border = allBorders;
            if (colNumber === 6) {
                cell.font = totalFont;
                cell.alignment = { horizontal: "right", vertical: "middle" };
            }
            if (colNumber === 9) {
                cell.font = totalFont;
                cell.fill = totalFill;
                cell.numFmt = "#,##0.00";
            }
        });
        totalRow.height = 24;

        ws.columns = [
            { width: 6 },
            { width: 14 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 12 },
            { width: 8 },
            { width: 10 },
            { width: 12 },
            { width: 6 },
            { width: 16 },
        ];
        applyBordersToSheet(ws);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const contractNo = (device.project as any).contractNumber || "";
    const fileName = encodeURIComponent(
        `${contractNo ? contractNo + "_" : ""}${(device.project as any).name || "采购清单"}.xlsx`,
    );

    return new NextResponse(buffer, {
        headers: {
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        },
    });
}
