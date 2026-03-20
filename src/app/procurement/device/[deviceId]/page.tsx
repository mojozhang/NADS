"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { getDevicePartsByType, updatePart, createPart, deletePart } from "@/app/actions/procurement"
import { toggleMilestone } from "@/app/actions/overview"
import { Loader2, ArrowLeft, ShoppingCart, CheckCircle2, AlertCircle, Upload, Download, FileSpreadsheet, Cog, Wrench, Plus, Trash2, Zap, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { saveAs } from "file-saver"

type TabType = 'standard' | 'machined' | 'outsourced' | 'electrical'

export default function ProcurementPage() {
    const params = useParams()
    const router = useRouter()
    const deviceId = params.deviceId as string
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [parts, setParts] = useState<{ standard: any[]; machined: any[]; outsourced: any[]; electrical: any[] }>({
        standard: [], machined: [], outsourced: [], electrical: []
    })
    const [projectTitle, setProjectTitle] = useState("")
    const [deviceCategory, setDeviceCategory] = useState("")
    const [contractNumber, setContractNumber] = useState("")
    const [projectId, setProjectId] = useState("")

    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('standard')
    const [uploadMessage, setUploadMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

    // 本地编辑缓存：用于实时计算小计
    const [localEdits, setLocalEdits] = useState<Record<string, { quantity?: number; unitPrice?: number }>>({})

    // 选中与多选删除
    const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set())

    // 删除确认弹窗
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; partId: string; partName: string }>({ open: false, partId: '', partName: '' })

    const getPartQuantity = (p: any) => localEdits[p.id]?.quantity ?? p.quantity ?? 1
    const getPartUnitPrice = (p: any) => localEdits[p.id]?.unitPrice ?? p.unitPrice ?? 0
    const getPartSubtotal = (p: any) => getPartQuantity(p) * getPartUnitPrice(p)
    const getTotal = (list: any[]) => list.reduce((s, p) => s + getPartSubtotal(p), 0)

    const fetchData = async () => {
        setIsLoading(true)
        const res = await getDevicePartsByType(deviceId)
        if (res.success) {
            setParts({
                standard: (res as any).standard || [],
                machined: (res as any).machined || [],
                outsourced: (res as any).outsourced || [],
                electrical: (res as any).electrical || [],
            })
            setProjectTitle((res as any).projectTitle || "")
            setDeviceCategory((res as any).deviceCategory || "")
            setContractNumber(String((res as any).contractNumber || ""))
            setProjectId((res as any).projectId || "")
            setLocalEdits({}) // 重置本地编辑
            setSelectedParts(new Set())
        }
        setIsLoading(false)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchData() }, [deviceId])

    useEffect(() => {
        if (uploadMessage) {
            const timer = setTimeout(() => setUploadMessage(null), 8000)
            return () => clearTimeout(timer)
        }
    }, [uploadMessage])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsUploading(true)
        setUploadMessage(null)
        const form = new FormData()
        form.append("file", file)
        form.append("deviceId", deviceId)
        try {
            const res = await fetch("/api/parse-excel", { method: "POST", body: form })
            const data = await res.json()
            if (data.success) {
                setUploadMessage({ text: data.message, type: 'success' })
                await fetchData()
            } else {
                setUploadMessage({ text: "导入失败: " + data.error, type: 'error' })
            }
        } catch (err: any) {
            setUploadMessage({ text: "上传错误: " + err.message, type: 'error' })
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleToggleStock = async (partId: string, current: boolean, partType: string) => {
        const newStocked = !current
        // 勾选入库时自动填入当天日期作为到货日期
        const updateData: any = { isStocked: newStocked }
        if (newStocked) {
            updateData.arrivalDate = new Date().toISOString().split('T')[0]
        }
        await updatePart(partId, updateData)
        const res = await getDevicePartsByType(deviceId)
        if (res.success) {
            const updatedParts = {
                standard: res.standard || [],
                machined: res.machined || [],
                outsourced: res.outsourced || [],
                electrical: (res as any).electrical || [],
            }
            setParts(updatedParts)
            const typeParts = updatedParts[partType as TabType]
            if (typeParts.length > 0 && typeParts.every((p: any) => p.isStocked)) {
                const milestoneMap: Record<string, string> = {
                    standard: 'standardPartAck',
                    machined: 'customPartAck',
                    outsourced: 'outsourcedPartAck',
                    electrical: 'electricalPartAck',
                }
                const field = milestoneMap[partType]
                if (field) {
                    await toggleMilestone(deviceId, field as any) // 注意：toggleMilestone 现在也应该支持 deviceId 了
                    const labelMap: Record<string, string> = { standard: '标准件', machined: '机加工', outsourced: '外协', electrical: '电气采购' }
                    setUploadMessage({ text: `🎉 ${labelMap[partType] || partType}全部入库！已自动更新里程碑`, type: 'success' })
                }
            }
        }
    }

    const handleDateChange = async (partId: string, field: 'issueDate' | 'arrivalDate', value: string) => {
        await updatePart(partId, { [field]: value || null })
    }

    const handleRemarkChange = async (partId: string, value: string) => {
        await updatePart(partId, { remark: value })
    }

    const handleFieldChange = async (partId: string, field: string, value: string) => {
        await updatePart(partId, { [field]: value })
    }

    /** 修改数量：即时更新本地小计，失焦后持久化 */
    const handleQuantityChange = (partId: string, value: string) => {
        const num = parseInt(value) || 0
        setLocalEdits(prev => ({ ...prev, [partId]: { ...prev[partId], quantity: num } }))
    }
    const handleQuantityBlur = async (partId: string, part: any) => {
        const qty = getPartQuantity(part)
        const price = getPartUnitPrice(part)
        await updatePart(partId, { quantity: qty, unitPrice: price, actualCost: qty * price })
    }

    /** 修改单价：即时更新本地小计，失焦后持久化 */
    const handleUnitPriceChange = (partId: string, value: string) => {
        const num = parseFloat(value) || 0
        setLocalEdits(prev => ({ ...prev, [partId]: { ...prev[partId], unitPrice: num } }))
    }
    const handleUnitPriceBlur = async (partId: string, part: any) => {
        const qty = getPartQuantity(part)
        const price = getPartUnitPrice(part)
        await updatePart(partId, { quantity: qty, unitPrice: price, actualCost: qty * price })
    }

    const tabs: { key: TabType; label: string; icon: any; color: string }[] = [
        { key: 'standard', label: '标准件', icon: ShoppingCart, color: 'blue' },
        { key: 'machined', label: '机加工', icon: Cog, color: 'purple' },
        { key: 'outsourced', label: '外协', icon: Wrench, color: 'indigo' },
        { key: 'electrical', label: '电气', icon: Zap, color: 'yellow' },
    ]

    /** 导出 Excel */
    const handleExport = async () => {
        try {
            const res = await fetch(`/api/export-excel?deviceId=${deviceId}`)
            if (!res.ok) throw new Error("下载失败")
            const blob = await res.blob()
            
            // 从 header 尝试提取文件名，没有则给备用名
            let filename = 'DeviceParts.xlsx'
            const contentDisposition = res.headers.get('Content-Disposition')
            if (contentDisposition) {
                const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
                if (filenameStarMatch && filenameStarMatch[1]) {
                    filename = decodeURIComponent(filenameStarMatch[1])
                }
            }
            
            saveAs(blob, filename)
        } catch (error) {
            console.error("导出失败", error)
            alert("导出失败，请重试")
        }
    }

    const handleTemplateDownload = async () => {
        try {
            const res = await fetch('/api/export-template')
            if (!res.ok) throw new Error("下载失败")
            const blob = await res.blob()
            saveAs(blob, '采购清单模板.xlsx')
        } catch (error) {
            console.error("下载模板失败", error)
            alert("下载模板失败，请重试")
        }
    }

    const currentParts = parts[activeTab]

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedParts(new Set(currentParts.map((p: any) => p.id)))
        else setSelectedParts(new Set())
    }

    const handleSelectRow = (id: string, checked: boolean) => {
        const newSet = new Set(selectedParts)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedParts(newSet)
    }

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50/30">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-6 bg-gray-50/30 min-h-screen">
            {/* 导入结果提示 */}
            {uploadMessage && (
                <div className={`flex items-center justify-between px-5 py-3 rounded-xl text-sm font-bold shadow-sm ${uploadMessage.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    <div className="flex items-center gap-2">
                        {uploadMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {uploadMessage.text}
                    </div>
                    <button onClick={() => setUploadMessage(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
                </div>
            )}

            {/* 顶部 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{projectTitle}</h1>
                            <span className="text-lg font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                                {deviceCategory}
                            </span>
                        </div>
                        {contractNumber && (
                            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md font-bold mt-1 inline-block">{contractNumber}</span>
                        )}
                        <p className="text-sm text-gray-500 font-medium">设备零部件采购记录</p>
                    </div>
                </div>
                <div className="flex gap-3 items-center">
                    {selectedParts.size > 0 && (
                        <Button onClick={() => setDeleteConfirm({ open: true, partId: 'bulk', partName: `已选中的 ${selectedParts.size} 个零件` })} className="rounded-xl font-bold shadow-sm text-white bg-red-600 hover:bg-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />
                            批量删除 ({selectedParts.size})
                        </Button>
                    )}
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} className="w-0 h-0 opacity-0 overflow-hidden absolute -z-10" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 font-bold">
                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {isUploading ? '导入中...' : '上传 Excel 清单'}
                    </Button>
                    <Button onClick={handleExport} variant="outline" className="rounded-xl font-bold border-gray-300 hover:bg-gray-50">
                        <Download className="w-4 h-4 mr-2" />
                        下载 Excel
                    </Button>
                    <Button onClick={handleTemplateDownload} variant="outline" className="rounded-xl font-bold border-dashed border-gray-300 hover:bg-gray-50 text-gray-500">
                        <Download className="w-4 h-4 mr-2" />
                        下载模板
                    </Button>
                </div>

            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {tabs.map(tab => (
                    <div key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedParts(new Set()); }} className={`cursor-pointer bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between transition-all ${activeTab === tab.key ? `border-blue-400 ring-2 ring-blue-100` : 'border-gray-100 hover:border-gray-200'}`}>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase mb-1">{tab.label}</p>
                            <p className="text-2xl font-black text-gray-900">{parts[tab.key].length}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                已入库: {parts[tab.key].filter((p: any) => p.isStocked).length} · 合计: ¥{getTotal(parts[tab.key]).toFixed(2)}
                            </p>
                        </div>
                        <div className={`p-3 rounded-xl bg-${tab.color}-50 text-${tab.color}-600`}>
                            <tab.icon className="w-6 h-6" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab 切换 */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedParts(new Set()); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                            {parts[tab.key].length}
                        </span>
                    </button>
                ))}
            </div>

            {/* 表格 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-x-auto">
                {activeTab === 'standard' ? (
                    /* ============ 标准件表格 ============ */
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-3 py-3 w-10 text-center"><input type="checkbox" checked={currentParts.length > 0 && selectedParts.size === currentParts.length} onChange={(e) => handleSelectAll(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" /></th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-10">序号</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">供应商</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">名称</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">材料/品牌</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">尺寸规格(mm)</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">下单日期</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">到货日期</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">快递/单号</th>
                                {/* 数量 单价 小计 相邻 */}
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-14 text-center bg-blue-50/50">数量</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-20 text-right bg-blue-50/50">单价</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-20 text-right bg-blue-50/50">小计</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">备注</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">发票</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-14 text-center">入库</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-10 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {currentParts.map((p: any, idx: number) => (
                                <tr key={p.id} className={`hover:bg-blue-50/30 transition-colors ${p.isStocked ? 'bg-green-50/20' : ''}`}>
                                    <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={selectedParts.has(p.id)} onChange={(e) => handleSelectRow(p.id, e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" /></td>
                                    <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.supplier || ''} onBlur={(e) => handleFieldChange(p.id, 'supplier', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full font-medium text-gray-700" /></td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.name || ''} onBlur={(e) => handleFieldChange(p.id, 'name', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full font-bold text-gray-900" /></td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.material || ''} onBlur={(e) => handleFieldChange(p.id, 'material', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full text-gray-600" /></td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.spec || ''} onBlur={(e) => handleFieldChange(p.id, 'spec', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full text-gray-500" /></td>
                                    <td className="px-3 py-2.5">
                                        <input type="date" defaultValue={p.issueDate ? format(new Date(p.issueDate), 'yyyy-MM-dd') : ''} onBlur={(e) => handleDateChange(p.id, 'issueDate', e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-28" />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <input type="date" defaultValue={p.arrivalDate ? format(new Date(p.arrivalDate), 'yyyy-MM-dd') : ''} onBlur={(e) => handleDateChange(p.id, 'arrivalDate', e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-28" />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2 min-w-[220px]">
                                            <div className="relative flex-1">
                                                <input
                                                    type="text"
                                                    defaultValue={[p.expressCompany, p.trackingNumber].filter(Boolean).join(' ')}
                                                    onBlur={(e) => {
                                                        const val = e.target.value.trim();
                                                        if (!val) {
                                                            handleFieldChange(p.id, 'expressCompany', '');
                                                            handleFieldChange(p.id, 'trackingNumber', '');
                                                            return;
                                                        }
                                                        const parts = val.split(/[\s,，;；]+/);
                                                        if (parts.length > 1) {
                                                            handleFieldChange(p.id, 'expressCompany', parts.slice(0, -1).join(' '));
                                                            handleFieldChange(p.id, 'trackingNumber', parts[parts.length - 1]);
                                                        } else {
                                                            handleFieldChange(p.id, 'expressCompany', '');
                                                            handleFieldChange(p.id, 'trackingNumber', val);
                                                        }
                                                    }}
                                                    className="text-[11px] bg-white border border-gray-300 rounded-md px-2 py-1.5 focus:border-blue-500 outline-none w-full shadow-sm"
                                                    placeholder="公司 单号"
                                                />
                                            </div>
                                            <button
                                                onMouseDown={(e) => {
                                                    // onMouseDown 触发早于 onBlur，可避免 React 重绘导致的事件丢失
                                                    const input = e.currentTarget.parentElement?.querySelector('input');
                                                    const val = input?.value.trim() || [p.expressCompany, p.trackingNumber].filter(Boolean).join(' ');
                                                    if (!val) return;
                                                    window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(val + ' 快递查询')}`, '_blank');
                                                }}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[11px] whitespace-nowrap hover:bg-blue-700 active:scale-95 transition-all font-bold shadow-md flex items-center gap-1"
                                            >
                                                <Search className="w-3 h-3" />
                                                查快递
                                            </button>
                                        </div>
                                    </td>
                                    {/* 数量 单价 小计 */}
                                    <td className="px-3 py-2.5 bg-blue-50/20">
                                        <input type="number" min="1" value={getPartQuantity(p)} onChange={(e) => handleQuantityChange(p.id, e.target.value)} onBlur={() => handleQuantityBlur(p.id, p)} className="text-xs bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 w-12 text-center font-bold" />
                                    </td>
                                    <td className="px-3 py-2.5 bg-blue-50/20">
                                        <input type="number" step="0.01" value={getPartUnitPrice(p)} onChange={(e) => handleUnitPriceChange(p.id, e.target.value)} onBlur={() => handleUnitPriceBlur(p.id, p)} className="text-xs bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 w-16 text-right font-medium" placeholder="0.00" />
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-xs font-black text-blue-700 bg-blue-50/20">
                                        ¥{getPartSubtotal(p).toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <input type="text" defaultValue={p.remark || ''} onBlur={(e) => handleRemarkChange(p.id, e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full" placeholder="添加备注..." />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <button onClick={() => handleFieldChange(p.id, 'invoiceInfo', p.invoiceInfo ? '' : '已开')} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mx-auto ${p.invoiceInfo ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300 hover:border-amber-400'}`}>
                                            {p.invoiceInfo && <CheckCircle2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <button onClick={() => handleToggleStock(p.id, p.isStocked, 'standard')} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mx-auto ${p.isStocked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                                            {p.isStocked && <CheckCircle2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <button onClick={() => setDeleteConfirm({ open: true, partId: p.id, partName: p.name || `#${idx + 1}` })} className="w-6 h-6 rounded-md flex items-center justify-center mx-auto text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200">
                                <td colSpan={11} className="px-3 py-3 text-right font-bold text-gray-600">合计</td>
                                <td className="px-3 py-3 text-right font-black text-blue-700 text-sm bg-blue-50/30">
                                    ¥{getTotal(currentParts).toFixed(2)}
                                </td>
                                <td colSpan={4}></td>
                            </tr>
                            <tr>
                                <td colSpan={16} className="px-3 py-2">
                                    <button onClick={async () => {
                                        const res = await createPart(deviceId, 'standard');
                                        if (res.error) {
                                            setUploadMessage({ text: "创建失败: " + res.error, type: 'error' });
                                        } else {
                                            await fetchData();
                                        }
                                    }} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-1 font-bold">
                                        <Plus className="w-3.5 h-3.5" /> 新增一行
                                    </button>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                ) : (
                    /* ============ 机加工 / 外协 表格 ============ */
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-10">序号</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">零件编号</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">名称</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">材料</th>

                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">发放日期</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">到货日期</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">快递/单号</th>
                                {/* 数量 单价 小计 相邻 */}
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-14 text-center bg-purple-50/50">数量</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-20 text-right bg-purple-50/50">单价</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-20 text-right bg-purple-50/50">小计</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-14 text-center">入库</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase">备注</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 uppercase w-10 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {currentParts.map((p: any, idx: number) => (
                                <tr key={p.id} className={`hover:bg-blue-50/30 transition-colors ${p.isStocked ? 'bg-green-50/20' : ''}`}>
                                    <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.partNumber || ''} onBlur={(e) => handleFieldChange(p.id, 'partNumber', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full font-mono text-gray-600" /></td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.name || ''} onBlur={(e) => handleFieldChange(p.id, 'name', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full font-bold text-gray-900" /></td>
                                    <td className="px-3 py-2.5"><input type="text" defaultValue={p.material || ''} onBlur={(e) => handleFieldChange(p.id, 'material', e.target.value)} className="text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full text-gray-600" /></td>

                                    <td className="px-3 py-2.5">
                                        <input type="date" defaultValue={p.issueDate ? format(new Date(p.issueDate), 'yyyy-MM-dd') : ''} onBlur={(e) => handleDateChange(p.id, 'issueDate', e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-28" />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <input type="date" defaultValue={p.arrivalDate ? format(new Date(p.arrivalDate), 'yyyy-MM-dd') : ''} onBlur={(e) => handleDateChange(p.id, 'arrivalDate', e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-28" />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2 min-w-[220px]">
                                            <div className="relative flex-1">
                                                <input
                                                    type="text"
                                                    defaultValue={[p.expressCompany, p.trackingNumber].filter(Boolean).join(' ')}
                                                    onBlur={(e) => {
                                                        const val = e.target.value.trim();
                                                        if (!val) {
                                                            handleFieldChange(p.id, 'expressCompany', '');
                                                            handleFieldChange(p.id, 'trackingNumber', '');
                                                            return;
                                                        }
                                                        const parts = val.split(/[\s,，;；]+/);
                                                        if (parts.length > 1) {
                                                            handleFieldChange(p.id, 'expressCompany', parts.slice(0, -1).join(' '));
                                                            handleFieldChange(p.id, 'trackingNumber', parts[parts.length - 1]);
                                                        } else {
                                                            handleFieldChange(p.id, 'expressCompany', '');
                                                            handleFieldChange(p.id, 'trackingNumber', val);
                                                        }
                                                    }}
                                                    className="text-[11px] bg-white border border-gray-300 rounded-md px-2 py-1.5 focus:border-blue-500 outline-none w-full shadow-sm"
                                                    placeholder="公司 单号"
                                                />
                                            </div>
                                            <button
                                                onMouseDown={(e) => {
                                                    const input = e.currentTarget.parentElement?.querySelector('input');
                                                    const val = input?.value.trim() || [p.expressCompany, p.trackingNumber].filter(Boolean).join(' ');
                                                    if (!val) return;
                                                    window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(val + ' 快递查询')}`, '_blank');
                                                }}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[11px] whitespace-nowrap hover:bg-blue-700 active:scale-95 transition-all font-bold shadow-md flex items-center gap-1"
                                            >
                                                <Search className="w-3 h-3" />
                                                查快递
                                            </button>
                                        </div>
                                    </td>
                                    {/* 数量 单价 小计 */}
                                    <td className="px-3 py-2.5 bg-purple-50/20">
                                        <input type="number" min="1" value={getPartQuantity(p)} onChange={(e) => handleQuantityChange(p.id, e.target.value)} onBlur={() => handleQuantityBlur(p.id, p)} className="text-xs bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 w-12 text-center font-bold" />
                                    </td>
                                    <td className="px-3 py-2.5 bg-purple-50/20">
                                        <input type="number" step="0.01" value={getPartUnitPrice(p)} onChange={(e) => handleUnitPriceChange(p.id, e.target.value)} onBlur={() => handleUnitPriceBlur(p.id, p)} className="text-xs bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 w-16 text-right font-medium" placeholder="0.00" />
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-xs font-black text-blue-700 bg-purple-50/20">
                                        ¥{getPartSubtotal(p).toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <button onClick={() => handleToggleStock(p.id, p.isStocked, activeTab)} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mx-auto ${p.isStocked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                                            {p.isStocked && <CheckCircle2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <input type="text" defaultValue={p.remark || ''} onBlur={(e) => handleRemarkChange(p.id, e.target.value)} className="text-xs bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-0.5 w-full" placeholder="添加备注..." />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <button onClick={() => setDeleteConfirm({ open: true, partId: p.id, partName: p.name || `#${idx + 1}` })} className="w-6 h-6 rounded-md flex items-center justify-center mx-auto text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200">
                                <td colSpan={10} className="px-3 py-3 text-right font-bold text-gray-600">合计</td>
                                <td className="px-3 py-3 text-right font-black text-blue-700 text-sm bg-purple-50/30">
                                    ¥{getTotal(currentParts).toFixed(2)}
                                </td>
                                <td colSpan={3}></td>
                            </tr>
                            <tr>
                                <td colSpan={14} className="px-3 py-2">
                                    <button onClick={async () => {
                                        const res = await createPart(deviceId, activeTab);
                                        if (res.error) {
                                            setUploadMessage({ text: "创建失败: " + res.error, type: 'error' });
                                        } else {
                                            await fetchData();
                                        }
                                    }} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-1 font-bold">
                                        <Plus className="w-3.5 h-3.5" /> 新增一行
                                    </button>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* 删除确认弹窗 */}
            <Dialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, partId: '', partName: '' }) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">确认删除</DialogTitle>
                        <DialogDescription>
                            确定要删除 <span className="font-bold text-gray-900">{deleteConfirm.partName}</span> 吗？此操作不可撤销。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2"></div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, partId: '', partName: '' })}>取消</Button>
                        <Button
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={async () => {
                                if (deleteConfirm.partId === 'bulk') {
                                    // 批量删除
                                    await Promise.all(Array.from(selectedParts).map(id => deletePart(id)))
                                    setSelectedParts(new Set())
                                } else {
                                    await deletePart(deleteConfirm.partId)
                                    // 若删除的对象在选中列表中，也剃除掉
                                    const newSet = new Set(selectedParts)
                                    newSet.delete(deleteConfirm.partId)
                                    setSelectedParts(newSet)
                                }
                                setDeleteConfirm({ open: false, partId: '', partName: '' })
                                await fetchData()
                            }}
                        >
                            确认删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}
