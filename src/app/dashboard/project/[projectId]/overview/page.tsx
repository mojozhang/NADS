"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { getProjectOverview } from "@/app/actions/overview"
import { updatePart, createPart, deletePart } from "@/app/actions/procurement"
import { format, differenceInDays } from "date-fns"
import {
    Loader2, ArrowLeft, ShoppingCart, CheckCircle2, AlertCircle,
    Download, Cog, Wrench, Plus, Trash2, Zap, Search,
    Briefcase, Calendar, DollarSign, User, Package, ChevronRight,
    Clock, Receipt, Truck, Info, History, FileDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

type TabType = 'standard' | 'machined' | 'outsourced' | 'electrical'

export default function ProjectOverviewPage() {
    const params = useParams()
    const router = useRouter()
    const projectId = params.projectId as string

    const [project, setProject] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [activeDetailTab, setActiveDetailTab] = useState<TabType | null>(null)
    const [localEdits, setLocalEdits] = useState<Record<string, { quantity?: number; unitPrice?: number }>>({})

    // 删除确认弹窗
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; partId: string; partName: string }>({ open: false, partId: '', partName: '' })
    const [deleteInput, setDeleteInput] = useState('')
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const res = await getProjectOverview(projectId)
        if (res.success) {
            setProject(res.data)
        } else {
            setMessage({ text: res.error || "获取数据失败", type: 'error' })
        }
        setIsLoading(false)
    }, [projectId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000)
            return () => clearTimeout(timer)
        }
    }, [message])

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50/30">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    if (!project) {
        return (
            <div className="p-8 text-center text-gray-500">
                项目不存在或加载失败
            </div>
        )
    }

    // 辅助计算
    const getAllParts = () => {
        const parts: any[] = []
        project.devices?.forEach((d: any) => {
            if (d.parts) {
                const deviceParts = d.parts.map((p: any) => ({
                    ...p,
                    deviceCategory: d.category,
                    deviceId: d.id
                }))
                parts.push(...deviceParts)
            }
        })
        return parts
    }

    const allParts = getAllParts()
    const groups: Record<TabType, any[]> = {
        standard: allParts.filter(p => p.type === 'standard'),
        machined: allParts.filter(p => p.type === 'machined'),
        outsourced: allParts.filter(p => p.type === 'outsourced'),
        electrical: allParts.filter(p => p.type === 'electrical'),
    }

    const getPartQuantity = (p: any) => localEdits[p.id]?.quantity ?? p.quantity ?? 1
    const getPartUnitPrice = (p: any) => localEdits[p.id]?.unitPrice ?? p.unitPrice ?? 0
    const getPartSubtotal = (p: any) => getPartQuantity(p) * getPartUnitPrice(p)
    const getGroupTotal = (list: any[]) => list.reduce((s, p) => s + getPartSubtotal(p), 0)

    // 时间计算
    const today = new Date()
    const signDate = project.contractSignDate ? new Date(project.contractSignDate) : null
    const deliveryDate = project.delivery ? new Date(project.delivery) : null
    const allShipped = project.devices?.every((d: any) => d.shipmentAck)

    let timeElapsed = 0
    let timeRemaining = 0
    let totalTime = 0
    let progressPercent = 0

    if (signDate && deliveryDate) {
        totalTime = differenceInDays(deliveryDate, signDate) || 1
        timeElapsed = differenceInDays(today, signDate)
        timeRemaining = differenceInDays(deliveryDate, today)
        progressPercent = allShipped ? 100 : Math.min(100, Math.max(0, (timeElapsed / totalTime) * 100))
    }

    const handleToggleStock = async (partId: string, current: boolean) => {
        const newStocked = !current
        const updateData: any = { isStocked: newStocked }
        if (newStocked) {
            updateData.arrivalDate = new Date().toISOString().split('T')[0]
        }
        const res = await updatePart(partId, updateData)
        if (res.success) {
            await fetchData()
        }
    }

    const handleFieldChange = async (partId: string, field: string, value: string) => {
        await updatePart(partId, { [field]: value })
    }

    const handleQuantityChange = (partId: string, value: string) => {
        const num = parseInt(value) || 0
        setLocalEdits(prev => ({ ...prev, [partId]: { ...prev[partId], quantity: num } }))
    }

    const handleQuantityBlur = async (partId: string, part: any) => {
        const qty = getPartQuantity(part)
        const price = getPartUnitPrice(part)
        await updatePart(partId, { quantity: qty, unitPrice: price, actualCost: qty * price })
    }

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
        { key: 'electrical', label: '电气采购', icon: Zap, color: 'yellow' },
    ]

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-gray-50/30 min-h-screen">
            {/* 提示消息 */}
            {message && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold shadow-xl animate-in slide-in-from-top-4 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {message.text}
                </div>
            )}

            {/* 顶部导航与项目标题 */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="rounded-full hover:bg-white shadow-sm">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{project.name}</h1>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${project.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 animate-pulse'}`}>
                                {project.status === 'completed' ? '已完结' : '执行中'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 font-medium">
                            <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> ID: {project.id.slice(-6).toUpperCase()}</span>
                            {project.contractNumber && <span className="flex items-center gap-1.5 font-mono bg-white px-2 py-0.5 rounded border border-gray-200"><Package className="w-4 h-4" /> {project.contractNumber}</span>}
                            {project.shipmentDocUrl && (
                                <a
                                    href={project.shipmentDocUrl}
                                    download={project.shipmentDocName || "发货单"}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                >
                                    <FileDown className="w-4 h-4" /> 发货单下载
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 时间进度条 */}
            {signDate && deliveryDate && (
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="font-bold text-gray-900">项目时间进度</span>
                            <span className="text-gray-400 font-medium text-xs">(自签订合同起)</span>
                        </div>
                        <span className="font-black text-blue-600">{progressPercent.toFixed(1)}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-3 bg-gray-100" />
                    <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">合同签订</p>
                            <p className="text-sm font-bold text-gray-900">{format(signDate, 'yyyy/MM/dd')}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">已用时间</p>
                            <p className="text-sm font-bold text-blue-600">{timeElapsed < 0 ? 0 : timeElapsed} 天</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">当前状态</p>
                            <p className={`text-sm font-bold ${allShipped ? 'text-green-600' : timeRemaining < 0 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                                {allShipped ? '已发货' : timeRemaining < 0 ? `已超期 ${Math.abs(timeRemaining)} 天` : `剩余 ${timeRemaining} 天`}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">预计交付</p>
                            <p className="text-sm font-bold text-gray-900">{format(deliveryDate, 'yyyy/MM/dd')}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 项目核心数据汇总 */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* 客户信息 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <User className="w-4 h-4" /> 客户与联系人
                    </h3>
                    <div>
                        <p className="text-lg font-black text-gray-900">{project.client?.name || '未知客户'}</p>
                        <p className="text-sm text-gray-500">{project.client?.contact || '无联系人'} {project.client?.phone || ''}</p>
                    </div>
                </div>

                {/* 财务简报 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> 项目金额
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-400 font-medium">合同总额</p>
                            <p className="text-lg font-black text-gray-900">¥{project.amount?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-medium">首款金额</p>
                            <p className="text-lg font-black text-blue-600">¥{project.downPayment?.toLocaleString() || '0'}</p>
                        </div>
                    </div>
                </div>

                {/* 开票统计 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Receipt className="w-4 h-4" /> 开票摘要
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-400 font-medium">已开票总额</p>
                            <p className="text-lg font-black text-purple-600">¥{project.contract?.invoicedAmount?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-medium">待开票</p>
                            <p className="text-lg font-black text-gray-900">¥{(Math.max(0, (project.amount || 0) - (project.contract?.invoicedAmount || 0))).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* 付款条件 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Info className="w-4 h-4" /> 付款说明
                    </h3>
                    <p className="text-sm font-medium text-gray-600 line-clamp-2">{project.paymentTerm || '无说明'}</p>
                </div>
            </div>

            {/* 开票情况 & 发货情况 (并排显示) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 发票列表 */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-black text-gray-900 flex items-center gap-2 uppercase tracking-tighter">
                            <Receipt className="w-5 h-5 text-purple-500" />
                            开票往来清单
                        </h3>
                    </div>
                    <div className="flex-1 overflow-auto max-h-[400px]">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <th className="px-8 py-3">发票号码</th>
                                    <th className="px-4 py-3">日期</th>
                                    <th className="px-4 py-3 text-right">金额</th>
                                    <th className="px-8 py-3 text-center">状态</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {project.invoices?.length > 0 ? project.invoices.map((inv: any) => (
                                    <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-8 py-4 font-mono font-bold text-gray-900">{inv.invoiceNumber || '未编号'}</td>
                                        <td className="px-4 py-4 text-gray-500">{inv.date ? format(new Date(inv.date), 'yyyy/MM/dd') : '--'}</td>
                                        <td className="px-4 py-4 text-right font-black text-purple-600">¥{inv.amount.toLocaleString()}</td>
                                        <td className="px-8 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${inv.status === 'matched' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {inv.status === 'matched' ? '已匹配' : inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-10 text-center text-gray-400 text-xs italic">暂无开票记录</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 付款节点 (合同) */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="font-black text-gray-900 flex items-center gap-2 uppercase tracking-tighter">
                            <DollarSign className="w-5 h-5 text-green-500" />
                            合同收款节点
                        </h3>
                    </div>
                    <div className="p-8 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">已确认首款</p>
                                <p className="text-xl font-black text-gray-900">¥{project.downPayment?.toLocaleString() || '0'}</p>
                                <p className="text-[10px] text-green-600 font-bold mt-1">{project.downPaymentAckDate ? format(new Date(project.downPaymentAckDate), 'yyyy/MM/dd') : '未到账'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">二期款</p>
                                <p className="text-xl font-black text-gray-900">¥{project.contract?.payAmount2?.toLocaleString() || '0'}</p>
                                <p className="text-[10px] text-gray-500 font-bold mt-1">{project.contract?.payTime2 || '待确认'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">三期款</p>
                                <p className="text-xl font-black text-gray-900">¥{project.contract?.payAmount3?.toLocaleString() || '0'}</p>
                                <p className="text-[10px] text-gray-500 font-bold mt-1">{project.contract?.payTime3 || '待确认'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">尾款/质保金</p>
                                <p className="text-xl font-black text-gray-900">¥{project.contract?.payAmount4?.toLocaleString() || '0'}</p>
                                <p className="text-[10px] text-gray-500 font-bold mt-1">{project.contract?.payTime4 || '待确认'}</p>
                            </div>
                        </div>
                        {project.contract?.paymentNote && (
                            <div className="mt-4 p-4 rounded-2xl bg-blue-50/30 border border-blue-100/50">
                                <p className="text-[10px] font-black text-blue-400 uppercase mb-1">收款备注</p>
                                <p className="text-xs text-blue-700 font-medium">{project.contract.paymentNote}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 工序物料组概况（核心交互区） */}
            <div className="space-y-4 pt-4">
                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <ShoppingCart className="w-6 h-6 text-blue-600" />
                    工序物料组概览
                    <span className="text-xs font-medium text-gray-400 normal-case ml-2">(点击卡片查看项目级完整清单)</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {tabs.map(tab => (
                        <div
                            key={tab.key}
                            onClick={() => setActiveDetailTab(tab.key)}
                            className={`group cursor-pointer bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-300 relative overflow-hidden ${activeDetailTab === tab.key ? 'ring-2 ring-blue-500 border-blue-100 shadow-blue-50' : ''}`}
                        >
                            <div className="relative z-10 flex flex-col h-full justify-between">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`p-3 rounded-2xl bg-${tab.color}-50 text-${tab.color}-600 group-hover:scale-110 transition-transform`}>
                                        <tab.icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tab.label}</span>
                                </div>

                                <div>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-3xl font-black text-gray-900">{groups[tab.key].length}</span>
                                        <span className="text-xs font-bold text-gray-400">项</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs font-medium">
                                        <span className="text-gray-500">已入库: {groups[tab.key].filter(p => p.isStocked).length}</span>
                                        <span className="text-blue-600 font-bold">¥{getGroupTotal(groups[tab.key]).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-1 text-[10px] font-black text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">
                                    查看明细 <ChevronRight className="w-3 h-3" />
                                </div>
                            </div>
                            <div className={`absolute -right-4 -bottom-4 w-24 h-24 bg-${tab.color}-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700`}></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 项目设备概览 & 里程碑关键点 */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <h3 className="font-black text-gray-900 flex items-center gap-2">
                        <Package className="w-5 h-5 text-gray-400" />
                        包含设备清单与里程碑 ({project.devices?.length || 0})
                    </h3>
                </div>
                <div className="divide-y divide-gray-50">
                    {project.devices?.map((device: any) => (
                        <div key={device.id} className="px-8 py-6 hover:bg-gray-50/50 transition-colors group">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-black shadow-lg shadow-blue-100 group-hover:scale-110 transition-transform">
                                        {device.id.slice(-1).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900">{device.category}</p>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-tighter">ID: {device.id}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => router.push(`/procurement/device/${device.id}`)} className="text-blue-600 border-blue-100 font-bold hover:bg-blue-50 h-9 rounded-xl">
                                        进入采购环节
                                    </Button>
                                </div>
                            </div>

                            {/* 里程碑概览图 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 px-2">
                                <MilestoneBox label="设计确认" date={device.designAck} color="blue" />
                                <MilestoneBox label="标准采购" date={device.standardPartAck} color="green" />
                                <MilestoneBox label="定制加工" date={device.customPartAck} color="purple" />
                                <MilestoneBox label="外协进度" date={device.outsourcedPartAck} color="indigo" />
                                <MilestoneBox label="电气采购" date={device.electricalPartAck} color="yellow" />
                                <MilestoneBox label="装配完成" date={device.assemblyAck} color="cyan" />
                                <MilestoneBox label="调试确认" date={device.debugAck} color="amber" />
                                <MilestoneBox label="发货确认" date={device.shipmentAck} color="red" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 详细清单 Modal */}
            <Dialog open={!!activeDetailTab} onOpenChange={(open) => !open && setActiveDetailTab(null)}>
                <DialogContent className="max-w-[95vw] w-[1400px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-3xl border-none shadow-2xl">
                    <DialogHeader className="px-8 py-6 bg-gray-900 text-white shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-2xl font-black flex items-center gap-3">
                                    {activeDetailTab && tabs.find(t => t.key === activeDetailTab)?.label} - 完整清单概览
                                    <span className="text-sm font-medium opacity-60 bg-white/20 px-3 py-1 rounded-full">项目级视角</span>
                                </DialogTitle>
                                <DialogDescription className="text-gray-400 mt-1 font-bold">
                                    项目 ID: {project.id.toUpperCase()} · 合计项目级跨设备物料项
                                </DialogDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">分类合计金额</p>
                                <p className="text-3xl font-black text-blue-400">¥{activeDetailTab ? getGroupTotal(groups[activeDetailTab]).toLocaleString() : 0}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto p-8">
                        {activeDetailTab && (
                            <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                                <thead>
                                    <tr className="text-gray-400 font-black text-[10px] uppercase tracking-widest">
                                        <th className="px-4 py-2">所属设备</th>
                                        <th className="px-4 py-2">供应商</th>
                                        <th className="px-4 py-2">名称</th>
                                        <th className="px-4 py-2">材料/品牌</th>
                                        <th className="px-4 py-2">规格</th>
                                        <th className="px-4 py-2 w-14 text-center">数量</th>
                                        <th className="px-4 py-2 w-28 text-right">单价</th>
                                        <th className="px-4 py-2 w-28 text-right">小计</th>
                                        <th className="px-4 py-2">日期管理</th>
                                        <th className="px-4 py-2 text-center w-14">入库</th>
                                        <th className="px-4 py-2">备注</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups[activeDetailTab].map((p: any) => (
                                        <tr key={p.id} className={`group bg-white rounded-xl shadow-sm hover:shadow-md transition-all ${p.isStocked ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                            <td className="px-4 py-3 first:rounded-l-xl">
                                                <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-[10px] font-black">{p.deviceCategory}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    defaultValue={p.supplier || ''}
                                                    onBlur={(e) => handleFieldChange(p.id, 'supplier', e.target.value)}
                                                    className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 w-full text-xs font-medium"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    defaultValue={p.name || ''}
                                                    onBlur={(e) => handleFieldChange(p.id, 'name', e.target.value)}
                                                    className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 w-full text-xs font-bold text-gray-900"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    defaultValue={p.material || ''}
                                                    onBlur={(e) => handleFieldChange(p.id, 'material', e.target.value)}
                                                    className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 w-full text-xs text-gray-600"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    defaultValue={p.spec || ''}
                                                    onBlur={(e) => handleFieldChange(p.id, 'spec', e.target.value)}
                                                    className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 w-full text-xs text-gray-500"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={getPartQuantity(p)}
                                                    onChange={(e) => handleQuantityChange(p.id, e.target.value)}
                                                    onBlur={() => handleQuantityBlur(p.id, p)}
                                                    className="bg-gray-50 border-none rounded p-1 w-12 text-center text-xs font-black"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <input
                                                    type="number"
                                                    value={getPartUnitPrice(p)}
                                                    onChange={(e) => handleUnitPriceChange(p.id, e.target.value)}
                                                    onBlur={() => handleUnitPriceBlur(p.id, p)}
                                                    className="bg-gray-50 border-none rounded p-1 w-20 text-right text-xs font-bold"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-black text-blue-600 font-mono">
                                                ¥{getPartSubtotal(p).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[8px] font-black text-gray-400 w-4">下</span>
                                                        <input
                                                            type="date"
                                                            defaultValue={p.issueDate ? format(new Date(p.issueDate), 'yyyy-MM-dd') : ''}
                                                            onBlur={(e) => handleFieldChange(p.id, 'issueDate', e.target.value)}
                                                            className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-[9px] w-24 font-bold"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[8px] font-black text-gray-400 w-4">到</span>
                                                        <input
                                                            type="date"
                                                            defaultValue={p.arrivalDate ? format(new Date(p.arrivalDate), 'yyyy-MM-dd') : ''}
                                                            onBlur={(e) => handleFieldChange(p.id, 'arrivalDate', e.target.value)}
                                                            className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-[10px] w-24 font-bold text-green-600"
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleToggleStock(p.id, p.isStocked)}
                                                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all mx-auto shadow-sm ${p.isStocked ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    defaultValue={p.remark || ''}
                                                    onBlur={(e) => handleFieldChange(p.id, 'remark', e.target.value)}
                                                    className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 w-full text-[10px]"
                                                />
                                            </td>
                                            <td className="px-4 py-3 last:rounded-r-xl">
                                                <button
                                                    onClick={() => { setDeleteConfirm({ open: true, partId: p.id, partName: p.name || '未命名零件' }); setDeleteInput('') }}
                                                    className="p-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className="mt-8 flex items-center justify-center py-10 border-2 border-dashed border-gray-100 rounded-3xl">
                            <div className="text-center">
                                <p className="text-sm text-gray-400 mb-4 font-bold italic">可在该分类下新增记录，默认关联至首台设备</p>
                                <Button
                                    disabled={!project.devices?.[0]}
                                    onClick={async () => {
                                        if (activeDetailTab && project.devices?.[0]) {
                                            const res = await createPart(project.devices[0].id, activeDetailTab);
                                            if (res.success) fetchData();
                                        }
                                    }}
                                    className="rounded-2xl font-black px-10 py-7 text-blue-600 border-blue-100 bg-blue-50 hover:bg-blue-100 shadow-lg shadow-blue-50 border-2 transition-all"
                                >
                                    <Plus className="w-6 h-6 mr-2" />
                                    新增 {activeDetailTab && tabs.find(t => t.key === activeDetailTab)?.label}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-8 py-7 bg-gray-50 border-t border-gray-100 sm:justify-between flex items-center shrink-0">
                        <div className="flex items-center gap-10">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-loose">当前条目</span>
                                <span className="text-2xl font-black text-gray-900">{activeDetailTab ? groups[activeDetailTab].length : 0}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-loose">分类总额</span>
                                <span className="text-2xl font-black text-blue-600">¥{activeDetailTab ? getGroupTotal(groups[activeDetailTab]).toLocaleString() : 0}</span>
                            </div>
                        </div>
                        <Button onClick={() => setActiveDetailTab(null)} className="rounded-2xl bg-gray-900 hover:bg-black font-black h-14 px-10 transition-all transform hover:scale-105 shadow-xl">
                            保存并返回概览
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 删除确认弹窗 */}
            <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, partId: '', partName: '' })}>
                <DialogContent className="sm:max-w-md rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 font-black">确认彻底删除内容</DialogTitle>
                        <DialogDescription className="font-bold">
                            确定要删除 <span className="font-black text-gray-900">{deleteConfirm.partName}</span> 吗？
                            <br /><span className="text-red-500">此操作不可撤销，数据将从系统库中永久移除。</span>
                            <br /><br />请输入 <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">DELETE</span> 来确认。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={deleteInput}
                        onChange={(e) => setDeleteInput(e.target.value)}
                        placeholder="DELETE"
                        className="font-mono text-center text-lg h-14 rounded-2xl border-2 focus:ring-red-500 focus:border-red-500 bg-gray-50"
                    />
                    <DialogFooter className="pt-4">
                        <Button variant="ghost" onClick={() => setDeleteConfirm({ open: false, partId: '', partName: '' })} className="font-bold rounded-xl h-12">暂不删除</Button>
                        <Button
                            disabled={deleteInput !== 'DELETE'}
                            className="bg-red-600 hover:bg-red-700 font-black rounded-2xl h-12 px-10 shadow-lg shadow-red-100"
                            onClick={async () => {
                                await deletePart(deleteConfirm.partId)
                                setDeleteConfirm({ open: false, partId: '', partName: '' })
                                await fetchData()
                            }}
                        >
                            确认永久删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function MilestoneBox({ label, date, color }: { label: string; date: string | null; color: string }) {
    const isDone = !!date
    return (
        <div className={`flex flex-col p-3 rounded-2xl border transition-all ${isDone ? `bg-${color}-50 border-${color}-100` : 'bg-gray-50/30 border-gray-100 opacity-40'}`}>
            <span className={`text-[9px] font-black uppercase tracking-tighter mb-1 ${isDone ? `text-${color}-600` : 'text-gray-400'}`}>{label}</span>
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold ${isDone ? 'text-gray-900' : 'text-gray-300'}`}>
                    {isDone ? format(new Date(date), 'MM/dd') : '--/--'}
                </span>
                {isDone && <CheckCircle2 className={`w-3 h-3 text-${color}-500`} />}
            </div>
        </div>
    )
}
