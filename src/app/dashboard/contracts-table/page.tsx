"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getContracts, updateContractField, syncProjectsToContracts, upsertContract, deleteContract } from "@/app/actions/contracts"
import { Loader2, Plus, Trash2, RefreshCw, Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { format } from "date-fns"

interface ContractRow {
    id: string
    seq: number
    contractNumber: string | null
    companyName: string
    projectName: string
    contractDate: string | null
    paymentMethod: string | null
    deliveryDate: string | null
    acceptanceDate: string | null
    shipDate: string | null
    contractAmount: number
    invoicedAmount: number
    completed: boolean
    paymentRemark: string | null
    payTime1: string | null
    payAmount1: number
    payTime2: string | null
    payAmount2: number
    payTime3: string | null
    payAmount3: number
    payTime4: string | null
    payAmount4: number
    paymentNote: string | null
    remark1: string | null
    remark2: string | null
    remark3: string | null
    remark4: string | null
}

// 计算衍生字段
function calcDerived(row: ContractRow) {
    const paid = (row.payAmount1 || 0) + (row.payAmount2 || 0) + (row.payAmount3 || 0) + (row.payAmount4 || 0)
    const unpaid = (row.contractAmount || 0) - paid
    const ratio = row.contractAmount > 0 ? unpaid / row.contractAmount : 0
    const uninvoiced = (row.contractAmount || 0) - (row.invoicedAmount || 0)
    return { paid, unpaid, ratio, uninvoiced }
}

// 列定义
const COLUMNS = [
    { key: "seq", label: "编号", width: "w-14", sticky: true, stickyLeft: "left-0", type: "readonly" },
    { key: "companyName", label: "公司名字", width: "w-36", sticky: true, stickyLeft: "left-14", type: "text", clickable: true },
    { key: "projectName", label: "设备清单", width: "w-40", sticky: true, stickyLeft: "left-[200px]", type: "text" },
    { key: "contractNumber", label: "合同编号", width: "w-32", type: "text" },
    { key: "contractDate", label: "合同签订日期", width: "w-32", type: "date" },
    { key: "paymentMethod", label: "付款方式", width: "w-28", type: "text" },
    { key: "deliveryDate", label: "设备规定交付日期", width: "w-36", type: "date" },
    { key: "acceptanceDate", label: "验收日期", width: "w-32", type: "date" },
    { key: "shipDate", label: "发货时间", width: "w-32", type: "date" },
    { key: "contractAmount", label: "合同金额", width: "w-28", type: "number", align: "right" },
    { key: "paid", label: "已付金额", width: "w-28", type: "computed", align: "right" },
    { key: "unpaid", label: "未付金额", width: "w-28", type: "computed", align: "right" },
    { key: "ratio", label: "剩余比例", width: "w-24", type: "computed", align: "right" },
    { key: "invoicedAmount", label: "已开票金额", width: "w-28", type: "number", align: "right" },
    { key: "uninvoiced", label: "未开票金额", width: "w-28", type: "computed", align: "right" },
    { key: "completed", label: "合同已完成", width: "w-24", type: "checkbox", align: "center" },
    { key: "paymentRemark", label: "付款备注", width: "w-32", type: "text" },
    { key: "payTime1", label: "付款时间1", width: "w-28", type: "date" },
    { key: "payAmount1", label: "付款金额1", width: "w-24", type: "number", align: "right" },
    { key: "payTime2", label: "付款时间2", width: "w-28", type: "date" },
    { key: "payAmount2", label: "付款金额2", width: "w-24", type: "number", align: "right" },
    { key: "payTime3", label: "付款时间3", width: "w-28", type: "date" },
    { key: "payAmount3", label: "付款金额3", width: "w-24", type: "number", align: "right" },
    { key: "payTime4", label: "付款时间4", width: "w-28", type: "date" },
    { key: "payAmount4", label: "付款金额4", width: "w-24", type: "number", align: "right" },
    { key: "paymentNote", label: "付款备注补充", width: "w-32", type: "text" },
    { key: "remark1", label: "备注1", width: "w-28", type: "text" },
    { key: "remark2", label: "备注2", width: "w-28", type: "text" },
    { key: "remark3", label: "备注3", width: "w-28", type: "text" },
    { key: "remark4", label: "备注4", width: "w-28", type: "text" },
] as const

type ColumnDef = (typeof COLUMNS)[number]

export default function ContractsTablePage() {
    const [rows, setRows] = useState<ContractRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filterCompany, setFilterCompany] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' })
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
    const tooltipTimer = useRef<NodeJS.Timeout | null>(null)

    const showTooltip = (e: React.MouseEvent, text: string) => {
        if (!text || text.length <= 6) return
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setTooltip({ text, x: rect.left, y: rect.bottom + 4 })
    }

    const hideTooltip = () => {
        tooltipTimer.current = setTimeout(() => setTooltip(null), 100)
    }

    const fetchData = useCallback(async () => {
        // 不再需要显式同步，后端已实现实时聚合
        const res = await getContracts()
        if (res.success && res.data) {
            setRows(res.data.map((c: any) => ({
                ...c,
                // 后端已经返回了基本处理过的数据，这里仅确保日期字符串格式适配 HTML 日期控件
                contractDate: c.contractDate ? format(new Date(c.contractDate), 'yyyy-MM-dd') : null,
                deliveryDate: c.deliveryDate ? format(new Date(c.deliveryDate), 'yyyy-MM-dd') : null,
                acceptanceDate: c.acceptanceDate ? format(new Date(c.acceptanceDate), 'yyyy-MM-dd') : null,
                shipDate: c.shipmentAck ? format(new Date(c.shipmentAck), 'yyyy-MM-dd') : null,
                payTime1: c.payTime1 || null,
                payTime2: c.payTime2 || null,
                payTime3: c.payTime3 || null,
                payTime4: c.payTime4 || null,
                completed: c.completed || false,
            })))
        }
        setIsLoading(false)
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleAddRow = async () => {
        await upsertContract(null, { companyName: "", projectName: "" })
        await fetchData()
    }

    const handleDeleteRow = (id: string) => {
        setDeleteConfirm({ open: true, id })
    }

    const confirmDelete = async () => {
        const id = deleteConfirm.id
        setDeleteConfirm({ open: false, id: '' })
        await deleteContract(id)
        await fetchData()
    }

    // 行内编辑：直接更新 state + server
    const handleFieldChange = (rowId: string, field: string, value: any) => {
        setRows(prev => prev.map(r => {
            if (r.id !== rowId) return r
            return { ...r, [field]: value }
        }))
    }

    const handleFieldBlur = async (rowId: string, field: string, value: any) => {
        await updateContractField(rowId, field, value)
    }

    // checkbox 直接同时更新
    const handleCheckboxChange = async (rowId: string, field: string, checked: boolean) => {
        handleFieldChange(rowId, field, checked)
        await updateContractField(rowId, field, checked)
    }

    const displayedRows = filterCompany
        ? rows.filter(r => r.companyName === filterCompany)
        : rows

    // 统计汇总
    const totals = displayedRows.reduce((acc, row) => {
        const d = calcDerived(row)
        acc.contractAmount += row.contractAmount || 0
        acc.paid += d.paid
        acc.unpaid += d.unpaid
        acc.invoicedAmount += row.invoicedAmount || 0
        acc.uninvoiced += d.uninvoiced
        return acc
    }, { contractAmount: 0, paid: 0, unpaid: 0, invoicedAmount: 0, uninvoiced: 0 })

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">合同管理与收款总表</h2>
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">{displayedRows.length} 条记录</span>
                    {filterCompany && (
                        <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100">
                            <Filter className="w-3 h-3" />
                            {filterCompany}
                            <button onClick={() => setFilterCompany(null)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleAddRow} size="sm" className="rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-700 shadow-sm">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        新增行
                    </Button>
                </div>
            </div>

            {/* 汇总栏 */}
            <div className="flex items-center gap-6 px-6 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold shrink-0">
                <span className="text-gray-500">汇总：</span>
                <span>合同总额 <span className="text-blue-600 font-black">¥{totals.contractAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></span>
                <span>已付 <span className="text-green-600 font-black">¥{totals.paid.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></span>
                <span>未付 <span className="text-red-600 font-black">¥{totals.unpaid.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></span>
                <span>已开票 <span className="text-purple-600 font-black">¥{totals.invoicedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></span>
                <span>未开票 <span className="text-amber-600 font-black">¥{totals.uninvoiced.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></span>
            </div>

            {/* 表格容器 */}
            <div className="flex-1 overflow-auto">
                <table className="min-w-max border-collapse text-xs">
                    {/* 表头 */}
                    <thead className="sticky top-0 z-30">
                        <tr className="bg-gray-800 text-white">
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    className={`${col.width} px-2.5 py-2.5 font-bold text-[11px] uppercase tracking-wider whitespace-nowrap border-r border-gray-700
                                        ${'align' in col && col.align === 'right' ? 'text-right' : 'align' in col && col.align === 'center' ? 'text-center' : 'text-left'}
                                        ${'sticky' in col && col.sticky ? `sticky ${col.stickyLeft} z-40 bg-gray-800` : ''}`}
                                >
                                    {col.label}
                                </th>
                            ))}
                            <th className="w-10 px-2 py-2.5 font-bold text-[11px] text-center sticky right-0 z-40 bg-gray-800 border-l border-gray-700">操作</th>
                        </tr>
                    </thead>

                    {/* 表体 */}
                    <tbody>
                        {displayedRows.map((row, idx) => {
                            const derived = calcDerived(row)
                            const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'

                            return (
                                <tr key={row.id} className={`${rowBg} hover:bg-blue-50/50 transition-colors group border-b border-gray-100`}>
                                    {COLUMNS.map((col) => {
                                        const isSticky = 'sticky' in col && col.sticky
                                        const stickyClass = isSticky ? `sticky ${col.stickyLeft} z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} group-hover:bg-blue-50/50` : ''
                                        const alignClass = 'align' in col && col.align === 'right' ? 'text-right' : 'align' in col && col.align === 'center' ? 'text-center' : 'text-left'

                                        // 只读序号
                                        if (col.key === 'seq') {
                                            return <td key={col.key} className={`${col.width} px-2.5 py-2 border-r border-gray-100 font-mono text-gray-400 ${stickyClass}`}>{row.seq}</td>
                                        }

                                        // 公司名（可点击筛选）
                                        if (col.key === 'companyName') {
                                            return (
                                                <td key={col.key} className={`${col.width} px-1 py-1 border-r border-gray-100 ${stickyClass}`}>
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={row.companyName}
                                                            onBlur={(e) => handleFieldBlur(row.id, 'companyName', e.target.value)}
                                                            onChange={(e) => handleFieldChange(row.id, 'companyName', e.target.value)}
                                                            className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1.5 py-1 text-xs font-bold text-gray-900"
                                                        />
                                                        {row.companyName && (
                                                            <button
                                                                onClick={() => setFilterCompany(row.companyName)}
                                                                className="shrink-0 p-0.5 rounded hover:bg-blue-100 text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="筛选该公司"
                                                            >
                                                                <Filter className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )
                                        }

                                        // 计算列
                                        if (col.type === 'computed') {
                                            let display = ''
                                            let colorClass = 'text-gray-700'

                                            if (col.key === 'paid') {
                                                display = `¥${derived.paid.toFixed(2)}`
                                                colorClass = derived.paid > 0 ? 'text-green-700 font-bold' : 'text-gray-400'
                                            } else if (col.key === 'unpaid') {
                                                display = `¥${derived.unpaid.toFixed(2)}`
                                                colorClass = derived.unpaid > 0 ? 'text-red-600 font-bold' : 'text-gray-400'
                                            } else if (col.key === 'ratio') {
                                                display = `${(derived.ratio * 100).toFixed(1)}%`
                                                colorClass = derived.ratio > 0.5 ? 'text-red-500 font-bold' : 'text-gray-600'
                                            } else if (col.key === 'uninvoiced') {
                                                display = `¥${derived.uninvoiced.toFixed(2)}`
                                                colorClass = derived.uninvoiced > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'
                                            }

                                            return <td key={col.key} className={`${col.width} px-2.5 py-2 border-r border-gray-100 ${alignClass} ${colorClass}`}>{display}</td>
                                        }

                                        // 勾选框（合同已完成）
                                        if (col.type === 'checkbox') {
                                            const checked = (row as any)[col.key] || false
                                            return (
                                                <td key={col.key} className={`${col.width} px-2.5 py-2 border-r border-gray-100 text-center ${stickyClass}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => handleCheckboxChange(row.id, col.key, e.target.checked)}
                                                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                                    />
                                                </td>
                                            )
                                        }

                                        // 数字输入
                                        if (col.type === 'number') {
                                            const val = (row as any)[col.key] || 0
                                            return (
                                                <td key={col.key} className={`${col.width} px-1 py-1 border-r border-gray-100 ${stickyClass}`}>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={val || ''}
                                                        onBlur={(e) => handleFieldBlur(row.id, col.key, e.target.value)}
                                                        onChange={(e) => handleFieldChange(row.id, col.key, parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1.5 py-1 text-xs text-right font-medium text-gray-700"
                                                    />
                                                </td>
                                            )
                                        }

                                        // 日期输入
                                        if (col.type === 'date') {
                                            const val = (row as any)[col.key] || ''
                                            return (
                                                <td key={col.key} className={`${col.width} px-1 py-1 border-r border-gray-100 ${stickyClass}`}>
                                                    <input
                                                        type="date"
                                                        value={val}
                                                        onChange={(e) => { handleFieldChange(row.id, col.key, e.target.value); handleFieldBlur(row.id, col.key, e.target.value) }}
                                                        className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1.5 py-1 text-xs text-gray-600"
                                                    />
                                                </td>
                                            )
                                        }

                                        // 默认文本输入（带 hover 浮动提示）
                                        const val = (row as any)[col.key] || ''
                                        return (
                                            <td
                                                key={col.key}
                                                className={`${col.width} px-1 py-1 border-r border-gray-100 ${stickyClass}`}
                                                onMouseEnter={(e) => showTooltip(e, val)}
                                                onMouseLeave={hideTooltip}
                                            >
                                                <input
                                                    type="text"
                                                    value={val}
                                                    onChange={(e) => handleFieldChange(row.id, col.key, e.target.value)}
                                                    onBlur={(e) => handleFieldBlur(row.id, col.key, e.target.value)}
                                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1.5 py-1 text-xs text-gray-700"
                                                />
                                            </td>
                                        )
                                    })}

                                    {/* 操作列 */}
                                    <td className="w-10 px-2 py-2 text-center sticky right-0 z-10 bg-white group-hover:bg-blue-50/50 border-l border-gray-100">
                                        <button
                                            onClick={() => handleDeleteRow(row.id)}
                                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                            title="删除"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}

                        {displayedRows.length === 0 && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="text-center py-16 text-gray-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="w-8 h-8 text-gray-200" />
                                        <p className="text-sm font-medium">暂无合同数据</p>
                                        <p className="text-xs">点击「同步项目数据」从已有项目导入，或点击「新增行」手动添加</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 删除确认弹窗 */}
            <Dialog open={deleteConfirm.open} onOpenChange={(open: boolean) => !open && setDeleteConfirm({ open: false, id: '' })}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除</DialogTitle>
                        <DialogDescription>确认删除此行合同记录吗？删除后无法恢复。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, id: '' })}>取消</Button>
                        <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 全局悬浮提示框（fixed 定位，不受 overflow 裁切） */}
            {tooltip && (
                <div
                    className="fixed z-[99999] pointer-events-none transition-opacity duration-150"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="bg-gray-900 border border-gray-700 text-white text-xs rounded shadow-2xl w-64 whitespace-pre-wrap break-words leading-relaxed p-3 font-medium">
                        {tooltip.text}
                    </div>
                </div>
            )}
        </div>
    )
}
