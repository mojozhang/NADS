"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { getDashboardProjects, updateProjectDelivery, toggleMilestone, archiveProject, unarchiveProject, updateProjectName, deleteProject } from "@/app/actions/overview"
import { format, differenceInDays } from "date-fns"
import { Loader2, CalendarClock, Briefcase, AlertTriangle, CheckCircle2, Search, Edit3, DollarSign, Calendar, Clock, Package, Check, Settings, Archive, XCircle, ShoppingCart, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function DashboardIndexPage() {
    const [projects, setProjects] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filterMode, setFilterMode] = useState<'active' | 'overallOverdue' | 'phaseOverdue' | 'archived'>('active')

    // 项目删除确认
    const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
    const [projectDeleteInput, setProjectDeleteInput] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true)
            const res = await getDashboardProjects()
            if (res.success && res.data) {
                setProjects(res.data)
            }
            setIsLoading(false)
        }
        fetchData()
    }, [])

    // 自定义确认弹窗
    const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => { } })
    const [alertDialog, setAlertDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })

    // 交互编辑状态
    const [editingProject, setEditingProject] = useState<any | null>(null)
    const [editDownPaymentDate, setEditDownPaymentDate] = useState("")
    const [editDownPayment, setEditDownPayment] = useState("")
    const [editDeliveryDate, setEditDeliveryDate] = useState("")
    const [editManualDays, setEditManualDays] = useState("")
    const [editManualType, setEditManualType] = useState("natural")
    const [editManualTrigger, setEditManualTrigger] = useState("contract")
    const [interveneMode, setInterveneMode] = useState<"date" | "days">("date")
    const [showManualDate, setShowManualDate] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [dpInputMode, setDpInputMode] = useState<"amount" | "percent">("amount")
    const [dpPercent, setDpPercent] = useState("")
    const [schedulingMode, setSchedulingMode] = useState<"auto" | "fixed" | "relative">("auto")

    // 阶段微调状态 (8个关键节点)
    const [editDesignEst, setEditDesignEst] = useState("")
    const [editStandardEst, setEditStandardEst] = useState("")
    const [editCustomEst, setEditCustomEst] = useState("")
    const [editOutsourcedEst, setEditOutsourcedEst] = useState("")
    const [editElectricalEst, setEditElectricalEst] = useState("")
    const [editAssemblyEst, setEditAssemblyEst] = useState("")
    const [editDebugEst, setEditDebugEst] = useState("")
    const [editShipmentEst, setEditShipmentEst] = useState("")

    const [isDesignManual, setIsDesignManual] = useState(false)
    const [isStandardManual, setIsStandardManual] = useState(false)
    const [isCustomManual, setIsCustomManual] = useState(false)
    const [isOutsourcedManual, setIsOutsourcedManual] = useState(false)
    const [isElectricalManual, setIsElectricalManual] = useState(false)
    const [isAssemblyManual, setIsAssemblyManual] = useState(false)
    const [isDebugManual, setIsDebugManual] = useState(false)
    const [isShipmentManual, setIsShipmentManual] = useState(false)


    // 辅助函数：前端实时计算排期 (模拟后端 addDaysCustom 和 subtractWorkdays)
    const calculateDatesRealtime = useCallback((baseDateStr: string, dpTrigger: string, days: number, type: "natural" | "workday") => {
        if (!baseDateStr) return null;
        const result = new Date(baseDateStr);
        let count = 0;
        let iter = 0;
        const isWorkday = type === "workday";
        while (count < days && iter < 1000) {
            result.setDate(result.getDate() + 1);
            const day = result.getDay();
            if (!isWorkday || (day !== 0 && day !== 6)) {
                count++;
            }
            iter++;
        }
        return result;
    }, []);

    const getWorkdayOffset = useCallback((date: Date, days: number): Date => {
        const result = new Date(date);
        let count = 0;
        let iter = 0;
        while (count < days && iter < 1000) {
            result.setDate(result.getDate() - 1);
            const day = result.getDay();
            if (day !== 0 && day !== 6) {
                count++;
            }
            iter++;
        }
        return result;
    }, []);

    // 执行全节点实时计算并更新状态
    const refreshAllNodeEstimates = useCallback((baseDate: Date, targetDelivery: Date) => {
        const delStr = format(targetDelivery, 'yyyy-MM-dd');
        setEditShipmentEst(delStr);
        setEditDeliveryDate(delStr);
        setEditDebugEst(delStr);

        // 倒推总装 (默认 4 工作日)
        const assDate = getWorkdayOffset(targetDelivery, 4);
        setEditAssemblyEst(format(assDate, 'yyyy-MM-dd'));

        // 倒推物料 (默认 1 工作日)
        const mfgDate = new Date(assDate);
        mfgDate.setDate(mfgDate.getDate() - 1);
        const mfgStr = format(mfgDate, 'yyyy-MM-dd');
        setEditStandardEst(mfgStr);
        setEditCustomEst(mfgStr);
        setEditOutsourcedEst(mfgStr);
        setEditElectricalEst(mfgStr);

        // 倒推设计完成 (默认物料/加工节点往前再倒推 7 个工作日)
        const designDate = getWorkdayOffset(mfgDate, 7);
        setEditDesignEst(format(designDate, 'yyyy-MM-dd'));
    }, [getWorkdayOffset]);

    const openEditModal = (project: any) => {
        setEditingProject(project)
        const dpDate = project.downPaymentAckDate ? new Date(project.downPaymentAckDate) : null;
        setEditDownPaymentDate(dpDate ? format(dpDate, 'yyyy-MM-dd') : "")
        setEditDownPayment(project.downPayment?.toString() || "")

        // 初始化排期模式
        if (!project.isDeliveryManual) {
            setSchedulingMode("auto")
        } else if (project.manualDeliveryDays) {
            setSchedulingMode("relative")
        } else {
            setSchedulingMode("fixed")
        }

        setEditManualDays(project.manualDeliveryDays?.toString() || "")
        setEditManualType(project.manualDeliveryType || "natural")
        setEditManualTrigger(project.manualDeliveryTrigger || "contract")
        setInterveneMode(project.manualDeliveryDays ? "days" : "date")

        const baseStart = dpDate || new Date(project.createdAt);
        const effectiveDays = project.manualDeliveryDays ?? project.deliveryDays ?? 45;
        const effectiveType = (project.manualDeliveryType ?? project.deliveryType ?? "natural") as "natural" | "workday";

        const autoDelivery = calculateDatesRealtime(format(baseStart, 'yyyy-MM-dd'), "downpayment", effectiveDays, effectiveType);

        if (autoDelivery) {
            refreshAllNodeEstimates(baseStart, autoDelivery);
        }

        // 默认不强制重置手动锁定，由用户按需点击模式切换来触发重置
        const device = project.devices?.[0] || {}
        setIsDesignManual(device.isDesignManual || false)
        setIsStandardManual(device.isStandardManual || false)
        setIsCustomManual(device.isCustomManual || false)
        setIsOutsourcedManual(device.isOutsourcedManual || false)
        setIsElectricalManual(device.isElectricalManual || false)
        setIsAssemblyManual(device.isAssemblyManual || false)
        setIsDebugManual(device.isDebugManual || false)
        setIsShipmentManual(device.isShipmentManual || false)

        if (project.amount && project.downPayment) {
            setDpPercent(((project.downPayment / project.amount) * 100).toFixed(0))
        } else {
            setDpPercent("")
        }
    }

    // 全模式实时推演
    useEffect(() => {
        if (!editingProject) return;

        let targetDelivery: Date | null = null;
        // 基准日：如果填了首款日就用首款日，没填就用项目创建日
        const baseStart = editDownPaymentDate ? new Date(editDownPaymentDate) : new Date(editingProject.createdAt);

        if (schedulingMode === 'auto') {
            if (!editDownPaymentDate) return; // 依首款推断模式下，没填首款就无法推演
            const days = editingProject.deliveryDays || 45;
            targetDelivery = calculateDatesRealtime(editDownPaymentDate, "downpayment", days, "natural");
        } else if (schedulingMode === 'relative') {
            if (!editDownPaymentDate) return; // 相对周期通常也依赖首款
            const days = parseInt(editManualDays) || 45;
            const type = (editManualType || "natural") as "natural" | "workday";
            targetDelivery = calculateDatesRealtime(editDownPaymentDate, "downpayment", days, type);
        } else if (schedulingMode === 'fixed' && editDeliveryDate) {
            targetDelivery = new Date(editDeliveryDate);
        }

        if (targetDelivery) {
            refreshAllNodeEstimates(baseStart, targetDelivery);

            // 只要发生了顶层主驱动的重新推演，就将下方所有子节点的手动修改标记重置，让它们恢复“自动生成”状态
            setIsDesignManual(false); setIsStandardManual(false); setIsCustomManual(false);
            setIsOutsourcedManual(false); setIsElectricalManual(false); setIsAssemblyManual(false);
            setIsDebugManual(false); setIsShipmentManual(false);
        }
    }, [editDownPaymentDate, editManualDays, editManualType, schedulingMode, editDeliveryDate, editingProject, refreshAllNodeEstimates, calculateDatesRealtime]);

    const handleSaveEdits = async () => {
        if (!editingProject) return
        setIsSaving(true)
        try {
            const res = await updateProjectDelivery(editingProject.id, {
                downPayment: editDownPayment ? parseFloat(editDownPayment) : null,
                downPaymentAckDate: editDownPaymentDate ? new Date(editDownPaymentDate) : null,
                // 如果没有手动微调发货期，则传 null 让后端自动联动重算
                delivery: schedulingMode === "fixed" ? (editDeliveryDate ? new Date(editDeliveryDate) : null) : null,
                manualDeliveryDays: schedulingMode === "relative" ? (editManualDays ? parseInt(editManualDays) : null) : null,
                manualDeliveryType: schedulingMode === "relative" ? editManualType : null,
                manualDeliveryTrigger: "downpayment", // 强制固定为首款触发以保证逻辑一致
                isDeliveryManual: schedulingMode !== "auto",
                designEst: editDesignEst ? new Date(editDesignEst) : null,
                standardPartEst: editStandardEst ? new Date(editStandardEst) : null,
                customPartEst: editCustomEst ? new Date(editCustomEst) : null,
                outsourcedPartEst: editOutsourcedEst ? new Date(editOutsourcedEst) : null,
                electricalPartEst: editElectricalEst ? new Date(editElectricalEst) : null,
                assemblyEst: editAssemblyEst ? new Date(editAssemblyEst) : null,
                debugEst: editDebugEst ? new Date(editDebugEst) : null,
                isDesignManual,
                isStandardManual,
                isCustomManual,
                isOutsourcedManual,
                isElectricalManual,
                isAssemblyManual,
                isDebugManual,
                isShipmentManual
            })
            if (res.success) {
                const refreshed = await getDashboardProjects()
                if (refreshed.success && refreshed.data) setProjects(refreshed.data)
                setEditingProject(null)
            } else {
                setAlertDialog({ open: true, title: '保存失败', message: res.error || '未知错误' })
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleToggleMilestone = async (projectId: string, field: any) => {
        try {
            const res = await toggleMilestone(projectId, field)
            if (res && 'success' in res && res.success) {
                const refreshed = await getDashboardProjects()
                if (refreshed.success && refreshed.data) setProjects(refreshed.data)
            } else {
                const errorMsg = (res && 'error' in res) ? res.error : '更新里程碑失败';
                setAlertDialog({ open: true, title: '操作失败', message: errorMsg || '更新里程碑失败' })
            }
        } catch (e: any) {
            setAlertDialog({ open: true, title: '系统错误', message: e.message })
        }
    }

    const handleArchive = (projectId: string) => {
        setConfirmDialog({
            open: true,
            title: '确认归档',
            message: '确认将此项目归档吗？归档后将移出执行中列表。',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                const res = await archiveProject(projectId)
                if (res.success) {
                    const refreshed = await getDashboardProjects()
                    if (refreshed.success && refreshed.data) setProjects(refreshed.data)
                } else {
                    setAlertDialog({ open: true, title: '归档失败', message: res.error || '未知错误' })
                }
            }
        })
    }

    const handleUnarchive = (projectId: string) => {
        setConfirmDialog({
            open: true,
            title: '取消归档',
            message: '确认取消归档此项目吗？项目将恢复到执行中列表。',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                const res = await unarchiveProject(projectId)
                if (res.success) {
                    const refreshed = await getDashboardProjects()
                    if (refreshed.success && refreshed.data) setProjects(refreshed.data)
                } else {
                    setAlertDialog({ open: true, title: '操作失败', message: res.error || '未知错误' })
                }
            }
        })
    }

    const now = new Date()

    // 基础过滤逻辑定义
    const isOverallOverdue = (p: any) => p.status !== 'completed' && p.delivery && new Date(p.delivery) < now
    const isPhaseOverdue = (p: any) => {
        if (p.status === 'completed') return false
        if (isOverallOverdue(p)) return false
        if (!p.devices || p.devices.length === 0) return false

        // 只要任一设备任一环节滞后，该项目即处于节点滞后状态
        return p.devices.some((device: any) => {
            const dOverdue = !device.designAck && device.designEst && new Date(device.designEst) < now
            const mOverdue = (!device.standardPartAck || !device.customPartAck || !device.outsourcedPartAck || !device.electricalPartAck) && device.mfgEst && new Date(device.mfgEst) < now
            const aOverdue = !device.assemblyAck && device.assemblyEst && new Date(device.assemblyEst) < now
            const dbOverdue = !device.debugAck && device.debugEst && new Date(device.debugEst) < now
            return dOverdue || mOverdue || aOverdue || dbOverdue
        })
    }

    // 统计值计算（始终基于全量数据）
    const stats = {
        active: projects.filter(p => p.status !== 'completed').length,
        overallOverdue: projects.filter(isOverallOverdue).length,
        phaseOverdue: projects.filter(isPhaseOverdue).length,
        archived: projects.filter(p => p.status === 'completed').length
    }

    // 实际显示的过滤列表
    const filteredProjects = projects.filter(p => {
        if (filterMode === 'active') return p.status !== 'completed'
        if (filterMode === 'overallOverdue') return isOverallOverdue(p)
        if (filterMode === 'phaseOverdue') return isPhaseOverdue(p)
        if (filterMode === 'archived') return p.status === 'completed'
        return true
    })

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
            <h2 className="text-2xl font-semibold text-gray-800">项目概览与排期进度</h2>

            {/* 统计概览 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div
                    onClick={() => setFilterMode('active')}
                    className={`cursor-pointer rounded-xl border p-6 shadow-sm transition-all hover:scale-[1.02] ${filterMode === 'active' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-200 opacity-70 hover:opacity-100'}`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-500">执行中项目</span>
                        <Package className={`w-5 h-5 ${filterMode === 'active' ? 'text-blue-600' : 'text-blue-500'}`} />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{stats.active}</div>
                </div>

                <div
                    onClick={() => setFilterMode('overallOverdue')}
                    className={`cursor-pointer rounded-xl border p-6 shadow-sm transition-all hover:scale-[1.02] ${filterMode === 'overallOverdue' ? 'bg-red-50 border-red-400 ring-2 ring-red-100' : 'bg-white border-gray-200 opacity-70 hover:opacity-100'}`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-500">超期警告</span>
                        <AlertTriangle className={`w-5 h-5 ${filterMode === 'overallOverdue' ? 'text-red-600' : 'text-red-500'}`} />
                    </div>
                    <div className="text-2xl font-black text-red-600">{stats.overallOverdue}</div>
                    <p className="text-[10px] text-gray-400 mt-1">整体交付期已过</p>
                </div>

                <div
                    onClick={() => setFilterMode('phaseOverdue')}
                    className={`cursor-pointer rounded-xl border p-6 shadow-sm transition-all hover:scale-[1.02] ${filterMode === 'phaseOverdue' ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' : 'bg-white border-gray-200 opacity-70 hover:opacity-100'}`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-500">工序超期警告</span>
                        <Clock className={`w-5 h-5 ${filterMode === 'phaseOverdue' ? 'text-amber-600' : 'text-amber-500'}`} />
                    </div>
                    <div className="text-2xl font-black text-amber-600">{stats.phaseOverdue}</div>
                    <p className="text-[10px] text-gray-400 mt-1">生产环节节点滞后</p>
                </div>

                <div
                    onClick={() => setFilterMode('archived')}
                    className={`cursor-pointer rounded-xl border p-6 shadow-sm transition-all hover:scale-[1.02] ${filterMode === 'archived' ? 'bg-green-50 border-green-400 ring-2 ring-green-100' : 'bg-white border-gray-200 opacity-70 hover:opacity-100'}`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-500">已完结归档</span>
                        <CheckCircle2 className={`w-5 h-5 ${filterMode === 'archived' ? 'text-green-600' : 'text-green-500'}`} />
                    </div>
                    <div className="text-2xl font-black text-green-600">{stats.archived}</div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">当前视角:</span>
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {filterMode === 'active' && '执行中'}
                        {filterMode === 'overallOverdue' && '项目超期'}
                        {filterMode === 'phaseOverdue' && '工序滞后'}
                        {filterMode === 'archived' && '历史归档'}
                    </span>
                    {filterMode !== 'active' && (
                        <button onClick={() => setFilterMode('active')} className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-2">
                            <XCircle className="w-3 h-3" /> 重置筛选
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                {isLoading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-100">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">该分类下暂无项目</h3>
                        <p className="text-gray-500 mt-2">试试点击其他统计卡片</p>
                    </div>
                ) : (
                    filteredProjects.map((project) => {
                        const daysLeft = project.delivery ? Math.ceil((new Date(project.delivery).getTime() - now.getTime()) / (1000 * 3600 * 24)) : null
                        const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0
                        const isOverdue = daysLeft !== null && daysLeft < 0
                        const isWaitingPayment = !project.downPaymentAckDate

                        return (
                            <div key={project.id} className={`group relative bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-xl transition-all duration-300 ${isOverdue ? 'border-red-100 bg-red-50/5' : isUrgent ? 'border-amber-100 bg-amber-50/5' : ''}`}>
                                {/* 顶部信息栏 */}
                                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                            <input
                                                type="text"
                                                defaultValue={project.name.replace(/(的合同设备项目|的合同设备|的设备项目|合同设备项目)/g, '')}
                                                onBlur={async (e) => {
                                                    const newName = e.target.value.trim()
                                                    if (newName && newName !== project.name) {
                                                        await updateProjectName(project.id, newName)
                                                    }
                                                }}
                                                className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none truncate w-[300px] max-w-full px-0.5"
                                                title="点击修改项目名称"
                                            />
                                            {project.contractNumber && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-mono rounded-md font-bold">
                                                    {project.contractNumber}
                                                </span>
                                            )}
                                            {/* 移除此处的全局采购入口 */}
                                            <button
                                                onClick={() => { setProjectDeleteConfirm({ open: true, id: project.id, name: project.name }); setProjectDeleteInput('') }}
                                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-all"
                                                title="删除项目"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {isOverdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 uppercase tracking-wider animate-pulse">超期警告</span>}
                                            {isUrgent && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600 uppercase tracking-wider">紧急交付</span>}
                                        </div>

                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <div className="flex gap-1">
                                                {project.devices && project.devices.map((d: any) => (
                                                    <span key={d.id} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-100">
                                                        {d.category} × {d.quantity}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className={`text-2xl font-black mb-1 ${isOverdue ? 'text-red-500' : isUrgent ? 'text-amber-500' : 'text-blue-500'}`}>
                                            {isOverdue ? Math.abs(daysLeft!) : daysLeft ?? '-'}
                                            <span className="text-xs font-bold ml-1">{isOverdue ? '天前交货' : '天后交货'}</span>
                                        </div>
                                        <div className="text-[11px] font-bold text-gray-400 flex items-center justify-end gap-1.5 uppercase tracking-tighter">
                                            <Calendar className="w-3.5 h-3.5" />
                                            最晚交货期: {project.delivery ? format(new Date(project.delivery), 'yyyy/MM/dd') : '未设定'}
                                        </div>
                                    </div>
                                </div>

                                {/* 合约原文与收款 */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-4 border-y border-gray-50/50 mb-6">
                                    <div className="flex items-start gap-2.5 text-xs text-gray-500">
                                        <Search className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" />
                                        <p className="italic line-clamp-2 leading-relaxed">
                                            原合同说明: {project.deliveryRaw || '暂无相关信息'}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-end gap-4">
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ring-1 ${project.downPaymentAckDate ? 'bg-green-50 text-green-700 ring-green-100' : 'bg-amber-50 text-amber-700 ring-amber-100 animate-pulse'}`}>
                                            <DollarSign className="w-3.5 h-3.5" />
                                            {project.downPaymentAckDate
                                                ? `首款已收${project.downPayment ? `: ¥${project.downPayment.toLocaleString()}` : ''} 于 ${format(new Date(project.downPaymentAckDate), 'yyyy/MM/dd')}`
                                                : '等候预付款到账'}
                                        </div>

                                        {project.shipmentAck && project.status !== 'completed' && (
                                            <Button
                                                onClick={() => handleArchive(project.id)}
                                                className="bg-green-600 hover:bg-green-700 text-white font-bold h-8 px-3 rounded-lg shadow-lg shadow-green-100 animate-in fade-in slide-in-from-right-2 duration-500"
                                            >
                                                <Archive className="w-3.5 h-3.5 mr-1.5" />
                                                立即归档
                                            </Button>
                                        )}

                                        {project.status === 'completed' && (
                                            <Button
                                                onClick={() => handleUnarchive(project.id)}
                                                variant="outline"
                                                className="text-amber-600 border-amber-200 hover:bg-amber-50 font-bold h-8 px-3 rounded-lg"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                                取消归档
                                            </Button>
                                        )}

                                        <button
                                            onClick={() => openEditModal(project)}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* 每个设备的独立里程碑进度 */}
                                <div className="mt-4 space-y-6">
                                    {project.devices && project.devices.map((device: any) => {
                                        // 计算单个设备的进度条百分比 (示例逻辑: 每完成一个大阶段加 20%)
                                        const getProgress = () => {
                                            let p = 0
                                            if (device.designAck) p += 20
                                            if (device.standardPartAck && device.customPartAck && device.outsourcedPartAck && device.electricalPartAck) p += 20
                                            if (device.assemblyAck) p += 20
                                            if (device.debugAck) p += 20
                                            if (device.shipmentAck) p += 20
                                            return p
                                        }

                                        return (
                                            <div key={device.id} className="bg-gray-50/30 rounded-xl p-4 border border-gray-100/50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                            {device.category} × {device.quantity}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">ID: {device.id.slice(-4)}</span>
                                                        <Link
                                                            href={`/procurement/device/${device.id}`}
                                                            className="p-1 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600 transition-all ml-1"
                                                            title="查看设备采购清单"
                                                        >
                                                            <ShoppingCart className="w-3.5 h-3.5" />
                                                        </Link>
                                                    </div>
                                                </div>

                                                <div className="relative">
                                                    <div className="overflow-hidden h-2 mb-4 flex rounded-full bg-gray-200/50 shadow-inner">
                                                        <div style={{ width: `${getProgress()}%` }} className="transition-all duration-700 bg-gradient-to-r from-blue-400 to-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]"></div>
                                                    </div>

                                                    <div className="flex justify-between items-start text-[10px] font-bold tracking-tight">
                                                        {/* 设计 */}
                                                        {(() => {
                                                            const overdue = !device.designAck && device.designEst && new Date(device.designEst) < now
                                                            return (
                                                                <div className="w-[18%]">
                                                                    <div className="flex flex-col items-center gap-1.5">
                                                                        <div
                                                                            className={`cursor-pointer w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${device.designAck ? 'bg-green-500 border-green-500 shadow-md scale-110' : overdue ? 'border-red-400 bg-red-50' : 'border-blue-400 hover:border-blue-600 bg-white'}`}
                                                                            onClick={() => handleToggleMilestone(device.id, 'designAck')}
                                                                        >
                                                                            {device.designAck && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                                                                        </div>
                                                                        <span className={device.designAck ? 'text-green-700' : overdue ? 'text-red-500 animate-pulse' : 'text-blue-700'}>设计完成</span>
                                                                        <div className="text-[8px] text-gray-400 scale-90">{device.designEst ? format(new Date(device.designEst), 'MM/dd') : '-'}</div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })()}

                                                        {/* 物料区域封装 */}
                                                        <div className="w-[35%] px-3 py-2 bg-gray-100/40 rounded-xl border border-gray-200/60 shadow-inner flex flex-col justify-center">
                                                            <div className="flex items-center justify-between mb-2 px-1">
                                                                <span className="text-[9px] text-gray-500 uppercase tracking-widest font-black">工序物料组</span>
                                                                <span className="text-[9px] text-gray-500 font-bold italic">EST: {device.mfgEst ? format(new Date(device.mfgEst), 'MM/dd') : '-'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {[
                                                                    { id: 'standardPartAck', est: 'standardPartEst', label: '标准件' },
                                                                    { id: 'customPartAck', est: 'customPartEst', label: '加工' },
                                                                    { id: 'outsourcedPartAck', est: 'outsourcedPartEst', label: '外协' },
                                                                    { id: 'electricalPartAck', est: 'electricalPartEst', label: '电气' }
                                                                ].map(part => {
                                                                    const isDone = !!device[part.id]
                                                                    const partEst = device[part.est]
                                                                    const overdue = !isDone && partEst && new Date(partEst) < now
                                                                    return (
                                                                        <div key={part.id} className="flex-1 flex flex-col items-center gap-1.5 group/part">
                                                                            <div
                                                                                className={`cursor-pointer w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isDone ? 'bg-indigo-500 border-indigo-500 shadow-sm' : overdue ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-gray-500 bg-white'}`}
                                                                                onClick={() => handleToggleMilestone(device.id, part.id as any)}
                                                                            >
                                                                                {isDone && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                                                                            </div>
                                                                            <div className="flex flex-col items-center gap-0.5">
                                                                                <span className={`text-[7px] font-black ${isDone ? 'text-indigo-600' : overdue ? 'text-red-500 animate-pulse' : 'text-gray-400 group-hover/part:text-gray-600'}`}>{part.label}</span>
                                                                                <span className="text-[6px] text-gray-400 scale-[0.85]">{partEst ? format(new Date(partEst), 'MM/dd') : '-'}</span>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* 总装 */}
                                                        {(() => {
                                                            const overdue = !device.assemblyAck && device.assemblyEst && new Date(device.assemblyEst) < now
                                                            return (
                                                                <div className="w-[12%]">
                                                                    <div className="flex flex-col items-center gap-1.5">
                                                                        <div
                                                                            className={`cursor-pointer w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${device.assemblyAck ? 'bg-green-500 border-green-500 shadow-md scale-110' : overdue ? 'border-red-400 bg-red-50' : 'border-purple-400 hover:border-purple-600 bg-white'}`}
                                                                            onClick={() => handleToggleMilestone(device.id, 'assemblyAck')}
                                                                        >
                                                                            {device.assemblyAck && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                                                                        </div>
                                                                        <span className={device.assemblyAck ? 'text-green-700' : overdue ? 'text-red-500 animate-pulse' : 'text-purple-700'}>总装</span>
                                                                        <div className="text-[8px] text-gray-400 scale-90">{device.assemblyEst ? format(new Date(device.assemblyEst), 'MM/dd') : '-'}</div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })()}

                                                        {/* 调试 */}
                                                        {(() => {
                                                            const overdue = !device.debugAck && device.debugEst && new Date(device.debugEst) < now
                                                            return (
                                                                <div className="w-[12%]">
                                                                    <div className="flex flex-col items-center gap-1.5">
                                                                        <div
                                                                            className={`cursor-pointer w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${device.debugAck ? 'bg-green-500 border-green-500 shadow-md scale-110' : overdue ? 'border-red-400 bg-red-50' : 'border-emerald-400 hover:border-emerald-600 bg-white'}`}
                                                                            onClick={() => handleToggleMilestone(device.id, 'debugAck')}
                                                                        >
                                                                            {device.debugAck && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                                                                        </div>
                                                                        <span className={device.debugAck ? 'text-green-700' : overdue ? 'text-red-500 animate-pulse' : 'text-emerald-700'}>调试</span>
                                                                        <div className="text-[8px] text-gray-400 scale-90">{device.debugEst ? format(new Date(device.debugEst), 'MM/dd') : '-'}</div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })()}

                                                        {/* 发货 */}
                                                        {(() => {
                                                            const deviceShipDate = device.shipmentAck ? new Date(device.shipmentAck) : null
                                                            const displayDate = deviceShipDate || (project.delivery ? new Date(project.delivery) : null)
                                                            const overdue = !device.shipmentAck && project.delivery && new Date(project.delivery) < now
                                                            return (
                                                                <div className="w-[15%]">
                                                                    <div className="flex flex-col items-center gap-1.5">
                                                                        <div
                                                                            className={`cursor-pointer w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${device.shipmentAck ? 'bg-green-500 border-green-500 shadow-md scale-110' : overdue ? 'border-red-400 bg-red-50' : 'border-teal-400 hover:border-teal-600 bg-white'}`}
                                                                            onClick={() => handleToggleMilestone(device.id, 'shipmentAck')}
                                                                        >
                                                                            {device.shipmentAck && <Check className="w-2.5 h-2.5 text-white stroke-[4]" />}
                                                                        </div>
                                                                        <span className={device.shipmentAck ? 'text-green-700' : overdue ? 'text-red-500 animate-pulse' : 'text-teal-700'}>发货</span>
                                                                        <div className="text-[8px] text-gray-400 scale-90">{displayDate ? format(displayDate, 'MM/dd') : '-'}</div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            <Dialog open={!!editingProject} onOpenChange={(open: boolean) => !open && setEditingProject(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>项目管理与排期修正</DialogTitle>
                        <DialogDescription>
                            调整项目款项到账情况，或处理约定交期补录。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="dp-amount" className="text-right">预付款设定</Label>
                            <div className="col-span-3 flex gap-2">
                                <div className="flex bg-gray-100 p-1 rounded-md w-fit h-9">
                                    <button
                                        className={`px-3 py-1 text-[10px] rounded-md transition-all ${dpInputMode === 'amount' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                                        onClick={() => setDpInputMode('amount')}
                                    >
                                        金额
                                    </button>
                                    <button
                                        className={`px-3 py-1 text-[10px] rounded-md transition-all ${dpInputMode === 'percent' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                                        onClick={() => setDpInputMode('percent')}
                                    >
                                        百分比
                                    </button>
                                </div>
                                {dpInputMode === 'amount' ? (
                                    <Input
                                        id="dp-amount"
                                        type="number"
                                        className="flex-1"
                                        value={editDownPayment}
                                        onChange={e => setEditDownPayment(e.target.value)}
                                        placeholder="具体金额(¥)"
                                    />
                                ) : (
                                    <div className="flex-1 flex gap-2">
                                        <Input
                                            type="number"
                                            className="w-20"
                                            value={dpPercent}
                                            onChange={e => {
                                                const p = e.target.value
                                                setDpPercent(p)
                                                if (editingProject?.amount && p) {
                                                    const calculated = (editingProject.amount * parseFloat(p) / 100).toFixed(2)
                                                    setEditDownPayment(calculated)
                                                }
                                            }}
                                            placeholder="30"
                                        />
                                        <span className="flex items-center text-gray-500 font-bold">%</span>
                                        <Input
                                            disabled
                                            className="flex-1 bg-gray-50"
                                            value={editDownPayment ? `¥${parseFloat(editDownPayment).toLocaleString()}` : '自动计算'}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="dp-date" className="text-right">首款到账日</Label>
                            <Input
                                id="dp-date"
                                type="date"
                                className="col-span-3"
                                value={editDownPaymentDate}
                                onChange={e => setEditDownPaymentDate(e.target.value)}
                            />
                        </div>
                        <div className="relative my-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-500 font-bold">排期驱动模式</span></div></div>

                        <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                            <button
                                className={`flex-1 py-1.5 text-xs rounded-md transition-all ${schedulingMode === 'auto' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200/50'}`}
                                onClick={() => setSchedulingMode('auto')}
                            >
                                自动联动 (依首款)
                            </button>
                            <button
                                className={`flex-1 py-1.5 text-xs rounded-md transition-all ${schedulingMode === 'fixed' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200/50'}`}
                                onClick={() => setSchedulingMode('fixed')}
                            >
                                固定出厂日期
                            </button>
                            <button
                                className={`flex-1 py-1.5 text-xs rounded-md transition-all ${schedulingMode === 'relative' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-200/50'}`}
                                onClick={() => setSchedulingMode('relative')}
                            >
                                相对交付周期
                            </button>
                        </div>

                        <div className="space-y-4 border-l-2 border-blue-100 pl-4 py-2 mt-2">
                            {schedulingMode === 'auto' && (
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right text-xs text-blue-600 font-semibold">首款到账日</Label>
                                    <Input
                                        type="date"
                                        className="col-span-3 border-blue-100"
                                        value={editDownPaymentDate}
                                        onChange={e => setEditDownPaymentDate(e.target.value)}
                                    />
                                    <p className="col-start-2 col-span-3 text-[10px] text-gray-400">系统将根据此日期自动推演后续 8 个工位排期。</p>
                                </div>
                            )}

                            {schedulingMode === 'fixed' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs">首款到账日</Label>
                                        <Input
                                            type="date"
                                            className="col-span-3"
                                            value={editDownPaymentDate}
                                            onChange={e => setEditDownPaymentDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs text-blue-600 font-bold">约定出厂日</Label>
                                        <Input
                                            type="date"
                                            className="col-span-3 border-blue-200 bg-blue-50/20"
                                            value={editDeliveryDate}
                                            onChange={e => setEditDeliveryDate(e.target.value)}
                                        />
                                    </div>
                                    <p className="col-start-2 col-span-3 text-[10px] text-gray-400">我们将基于此固定日期反向排定生产计划。</p>
                                </div>
                            )}

                            {schedulingMode === 'relative' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs">首款到账日</Label>
                                        <Input
                                            type="date"
                                            className="col-span-3"
                                            value={editDownPaymentDate}
                                            onChange={e => setEditDownPaymentDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs">周期设置</Label>
                                        <div className="col-span-3 flex gap-2">
                                            <Input
                                                type="number"
                                                className="w-24"
                                                value={editManualDays}
                                                onChange={e => setEditManualDays(e.target.value)}
                                                placeholder="天数"
                                            />
                                            <select
                                                className="flex-1 rounded-md border border-gray-200 text-xs px-2"
                                                value={editManualType}
                                                onChange={e => setEditManualType(e.target.value)}
                                            >
                                                <option value="natural">自然日</option>
                                                <option value="workday">工作日</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative my-4"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">各工序节点微调</span></div></div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-2">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isDesignManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>设计完成</Label>{isDesignManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsDesignManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isDesignManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editDesignEst} onChange={e => { setEditDesignEst(e.target.value); setIsDesignManual(true); }} />
                            </div>
                            <div className="space-y-1 opacity-50"><Label className="text-[10px] text-gray-500">物料估算(总)</Label><Input disabled className="h-8 text-xs bg-gray-50" value={editStandardEst} /></div>

                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isStandardManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>标准件到位</Label>{isStandardManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsStandardManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isStandardManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editStandardEst} onChange={e => { setEditStandardEst(e.target.value); setIsStandardManual(true); }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isCustomManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>加工件到位</Label>{isCustomManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsCustomManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isCustomManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editCustomEst} onChange={e => { setEditCustomEst(e.target.value); setIsCustomManual(true); }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isOutsourcedManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>外协到位</Label>{isOutsourcedManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsOutsourcedManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isOutsourcedManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editOutsourcedEst} onChange={e => { setEditOutsourcedEst(e.target.value); setIsOutsourcedManual(true); }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isElectricalManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>电气外购到位</Label>{isElectricalManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsElectricalManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isElectricalManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editElectricalEst} onChange={e => { setEditElectricalEst(e.target.value); setIsElectricalManual(true); }} />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isAssemblyManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>总装完成</Label>{isAssemblyManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsAssemblyManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isAssemblyManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editAssemblyEst} onChange={e => { setEditAssemblyEst(e.target.value); setIsAssemblyManual(true); }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isDebugManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>调试出厂</Label>{isDebugManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsDebugManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isDebugManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editDebugEst} onChange={e => { setEditDebugEst(e.target.value); setIsDebugManual(true); }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><Label className={`text-[10px] ${isShipmentManual ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>发货</Label>{isShipmentManual && <span className="text-[8px] text-blue-500 cursor-pointer" onClick={() => setIsShipmentManual(false)}>重置</span>}</div>
                                <Input type="date" className={`h-8 text-xs ${isShipmentManual ? 'border-blue-300 bg-blue-50' : ''}`} value={editShipmentEst} onChange={e => { setEditShipmentEst(e.target.value); setIsShipmentManual(true); }} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProject(null)} disabled={isSaving}>取消</Button>
                        <Button onClick={handleSaveEdits} disabled={isSaving}>
                            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存更新并重算
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 确认弹窗（替换原生 confirm） */}
            <Dialog open={confirmDialog.open} onOpenChange={(open: boolean) => !open && setConfirmDialog(prev => ({ ...prev, open: false }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.message}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>取消</Button>
                        <Button onClick={confirmDialog.onConfirm} className="bg-red-600 hover:bg-red-700">确认</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 提示弹窗（替换原生 alert） */}
            <Dialog open={alertDialog.open} onOpenChange={(open: boolean) => !open && setAlertDialog(prev => ({ ...prev, open: false }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{alertDialog.title}</DialogTitle>
                        <DialogDescription>{alertDialog.message}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setAlertDialog(prev => ({ ...prev, open: false }))}>知道了</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 项目删除确认弹窗 */}
            <Dialog open={projectDeleteConfirm.open} onOpenChange={(open) => { if (!open) { setProjectDeleteConfirm({ open: false, id: '', name: '' }); setProjectDeleteInput('') } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">删除项目</DialogTitle>
                        <DialogDescription>
                            确定要删除项目 <span className="font-bold text-gray-900">{projectDeleteConfirm.name}</span> 吗？<br />
                            此操作将永久删除项目及其所有关联数据（零件、设备、合同记录），不可撤销。<br />
                            请输入 <span className="font-mono font-bold text-red-600">DELETE</span> 确认。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={projectDeleteInput}
                        onChange={(e) => setProjectDeleteInput(e.target.value)}
                        placeholder="请输入 DELETE"
                        className="font-mono"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setProjectDeleteConfirm({ open: false, id: '', name: '' }); setProjectDeleteInput('') }}>取消</Button>
                        <Button
                            disabled={projectDeleteInput !== 'DELETE'}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-40"
                            onClick={async () => {
                                await deleteProject(projectDeleteConfirm.id)
                                setProjectDeleteConfirm({ open: false, id: '', name: '' })
                                setProjectDeleteInput('')
                                setProjects(prev => prev.filter(p => p.id !== projectDeleteConfirm.id))
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
