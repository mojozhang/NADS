"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UploadCloud, FileText, CheckCircle2, Loader2, AlertCircle, Clock, Check } from "lucide-react"
import { getRecentProjects, addPaymentRecord } from "@/app/actions/history"
import { format } from "date-fns"
import * as pdfjs from 'pdfjs-dist'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// 设置 pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export default function ContractsPage() {
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle")
    const [errorMessage, setErrorMessage] = useState("")
    const [recentProjects, setRecentProjects] = useState<any[]>([])
    const [allProjects, setAllProjects] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [isLoadingList, setIsLoadingList] = useState(true)
    const [previews, setPreviews] = useState<{ page: number, url: string }[]>([])
    const [selectedPages, setSelectedPages] = useState<number[]>([1]) // 默认选第一页
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false)
    const [uploadMode, setUploadMode] = useState<"contract" | "invoice" | "payment">("contract")
    const [paymentAmount, setPaymentAmount] = useState("")
    const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [paymentSearchTerm, setPaymentSearchTerm] = useState("")
    const [paymentNote, setPaymentNote] = useState("")
    const [paymentInputMode, setPaymentInputMode] = useState<"amount" | "percentage">("amount")
    const [paymentPercentage, setPaymentPercentage] = useState("")
    const [selectedProjectAmount, setSelectedProjectAmount] = useState<number | null>(null)

    // 批处理状态
    const [uploadQueue, setUploadQueue] = useState<{
        id: string;
        fileName: string;
        status: "waiting" | "processing" | "success" | "error" | "collision";
        error?: string;
        result?: any;
    }[]>([])

    const [collisionData, setCollisionData] = useState<{
        show: boolean;
        reason: string;
        parsed: any;
        candidates: any[];
        queueId?: string;
    }>({ show: false, reason: "", parsed: null, candidates: [] })
    const [isLinking, setIsLinking] = useState(false)



    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = Array.from(e.target.files)

            if (uploadMode === 'contract') {
                // 合同模式依然保持单选逻辑
                const primaryFile = selectedFiles[0]
                setFiles([primaryFile])
                setUploadStatus("idle")
                setPreviews([])
                setSelectedPages([1])
                setUploadQueue([{
                    id: Math.random().toString(36).substring(7),
                    fileName: primaryFile.name,
                    status: "waiting"
                }])

                if (primaryFile.type === "application/pdf") {
                    generatePdfPreviews(primaryFile)
                }
            } else {
                // 发票模式支持多选且累加
                setFiles(prev => [...prev, ...selectedFiles])
                setUploadStatus("idle")

                // 初始化队列
                const newQueueItems = selectedFiles.map(f => ({
                    id: Math.random().toString(36).substring(7),
                    fileName: f.name,
                    status: "waiting" as const
                }))
                setUploadQueue(prev => [...prev, ...newQueueItems])
            }
        }
    }

    const generatePdfPreviews = async (pdfFile: File) => {
        setIsGeneratingPreviews(true)
        try {
            const arrayBuffer = await pdfFile.arrayBuffer()
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
            const pdf = await loadingTask.promise
            const numPages = Math.min(pdf.numPages, 10) // 最多展示前10页预览
            const newPreviews: { page: number, url: string }[] = []

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i)
                const viewport = page.getViewport({ scale: 0.3 }) // 缩略图
                const canvas = document.createElement('canvas')
                const context = canvas.getContext('2d')
                canvas.height = viewport.height
                canvas.width = viewport.width

                if (context) {
                    await page.render({ canvasContext: context, viewport }).promise
                    newPreviews.push({ page: i, url: canvas.toDataURL('image/jpeg', 0.8) })
                }
            }
            setPreviews(newPreviews)
            // 如果只有几页，默认全选
            if (numPages <= 3) {
                setSelectedPages(Array.from({ length: numPages }, (_, i) => i + 1))
            }
        } catch (error) {
            console.error("生成预览失败:", error)
        } finally {
            setIsGeneratingPreviews(false)
        }
    }

    const togglePage = (pageNum: number) => {
        setSelectedPages(prev =>
            prev.includes(pageNum)
                ? prev.filter(p => p !== pageNum)
                : [...prev, pageNum].sort((a, b) => a - b)
        )
    }

    const removeFile = (id: string) => {
        setUploadQueue(prev => {
            const item = prev.find(i => i.id === id)
            if (item) {
                setFiles(f => f.filter(file => file.name !== item.fileName))
            }
            return prev.filter(i => i.id !== id)
        })
    }

    const processSingleFile = async (file: File, queueId: string) => {
        setUploadQueue(prev => prev.map(item =>
            item.id === queueId ? { ...item, status: "processing" } : item
        ))

        try {
            const formData = new FormData()
            formData.append("file", file)
            if (uploadMode === 'contract') {
                formData.append("selectedPages", JSON.stringify(selectedPages))
            }

            const response = await fetch(uploadMode === 'contract' ? "/api/parse-contract" : "/api/parse-invoice", {
                method: "POST",
                body: formData
            })

            const resData = await response.json()

            if (!response.ok) throw new Error(resData.error || "解析失败")

            if (uploadMode === 'invoice' && resData.collision) {
                setUploadQueue(prev => prev.map(item =>
                    item.id === queueId ? { ...item, status: "collision", result: resData } : item
                ))

                setCollisionData(current => {
                    if (current.show) return current;
                    return {
                        show: true,
                        reason: resData.reason,
                        parsed: resData.parsed,
                        candidates: resData.candidates || [],
                        queueId: queueId
                    }
                })
                return "collision"
            }

            setUploadQueue(prev => prev.map(item =>
                item.id === queueId ? { ...item, status: "success" } : item
            ))
            return "success"
        } catch (error) {
            const msg = error instanceof Error ? error.message : "未知错误"
            setUploadQueue(prev => prev.map(item =>
                item.id === queueId ? { ...item, status: "error", error: msg } : item
            ))
            return "error"
        }
    }

    const handleUpload = async () => {
        if (files.length === 0) return
        setIsUploading(true)
        setUploadStatus("uploading")

        if (uploadMode === 'contract') {
            const qId = uploadQueue[0]?.id || "default"
            const result = await processSingleFile(files[0], qId)
            if (result === 'success') {
                setUploadStatus("success")
                setFiles([])
                setUploadQueue([])
                fetchHistory()
            } else if (result === 'error') {
                setUploadStatus("error")
                setErrorMessage(uploadQueue.find(i => i.id === qId)?.error || "上传失败")
            }
            setIsUploading(false)
        } else {
            // 发票批处理 - 改为串行处理以支持“发现错误立即停止”
            const pendingItems = uploadQueue.filter(item => item.status === 'waiting')

            for (const item of pendingItems) {
                const file = files.find(f => f.name === item.fileName)
                if (!file) continue

                const result = await processSingleFile(file, item.id)

                // 如果出现错误（如类型不匹配），则按照用户要求“停止工作”
                if (result === 'error') {
                    setUploadStatus("error")
                    const errorMsg = uploadQueue.find(q => q.id === item.id)?.error || "处理中断"
                    setErrorMessage(errorMsg)
                    break
                }
            }

            setUploadQueue(currentQueue => {
                const hasError = currentQueue.some(item => item.status === 'error')
                const allProcessed = currentQueue.every(item => item.status !== 'waiting' && item.status !== 'processing')
                const hasCollision = currentQueue.some(item => item.status === 'collision')

                if (allProcessed && !hasCollision) {
                    if (hasError) setUploadStatus("error")
                    else {
                        setUploadStatus("success")
                        setFiles([])
                        setUploadQueue([])
                    }
                } else if (hasCollision) {
                    setUploadStatus("idle")
                } else if (hasError) {
                    // 如果中途停止了，也保持 error 状态
                    setUploadStatus("error")
                }
                return currentQueue
            })
            setIsUploading(false)
            fetchHistory()
        }
    }

    const fetchHistory = async () => {
        setIsLoadingList(true)
        try {
            console.log("Fetching history and active projects...");
            const res = await getRecentProjects()
            if (res.success && res.data) {
                setRecentProjects(res.data)
            } else {
                console.warn("Failed to fetch recent projects:", res.error);
            }

            const allRes = await fetch("/api/projects/active").then(r => r.json())
            if (allRes.success) {
                setAllProjects(allRes.data)
            } else {
                console.warn("Failed to fetch all active projects:", allRes.error);
            }
        } catch (error) {
            console.error("Error in fetchHistory:", error);
        } finally {
            setIsLoadingList(false)
        }
    }

    useEffect(() => {
        fetchHistory()
    }, [])

    const handlePaymentSubmit = async () => {
        if (!selectedProjectId || !paymentAmount) return
        setIsUploading(true)
        setUploadStatus("idle")
        setErrorMessage("")

        try {
            console.log("Submitting payment for project:", selectedProjectId);
            const res = await addPaymentRecord(selectedProjectId, parseFloat(paymentAmount), paymentDate, paymentNote)

            if (res && res.success) {
                console.log("Payment submission successful");
                setUploadStatus("success")
                setPaymentAmount("")
                setSelectedProjectId("")
                setPaymentSearchTerm("")
                setPaymentNote("")
                // 异步执行刷新，不阻塞 UI 状态重置
                fetchHistory().catch(e => console.error("Async history refresh failed:", e));
            } else {
                const err = res?.error || "服务器未返回明确成功状态";
                console.error("Payment submission failed:", err);
                throw new Error(err)
            }
        } catch (error) {
            console.error("Caught error in handlePaymentSubmit:", error);
            setUploadStatus("error")
            setErrorMessage(error instanceof Error ? error.message : "请求发送失败，请检查网络或重新登录")
        } finally {
            setIsUploading(false)
        }
    }

    const handleManualLink = async (projectId: string) => {
        setIsLinking(true)
        try {
            const res = await fetch("/api/link-invoice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    parsed: collisionData.parsed
                })
            })
            if (!res.ok) throw new Error("关联失败")

            if (collisionData.queueId) {
                setUploadQueue(prev => {
                    const nextQueue = prev.map(item =>
                        item.id === collisionData.queueId ? { ...item, status: "success" as const } : item
                    )

                    const nextCollision = nextQueue.find(item => item.status === 'collision')
                    if (nextCollision && nextCollision.result) {
                        setCollisionData({
                            show: true,
                            reason: nextCollision.result.reason,
                            parsed: nextCollision.result.parsed,
                            candidates: nextCollision.result.candidates || [],
                            queueId: nextCollision.id
                        })
                    } else {
                        setCollisionData(prev => ({ ...prev, show: false }))
                        if (nextQueue.every(item => item.status === 'success' || item.status === 'error')) {
                            setUploadStatus("success")
                            setFiles([])
                            setUploadQueue([])
                        }
                    }
                    return nextQueue
                })
            }
            fetchHistory()
        } catch (error) {
            setErrorMessage("手动关联项目失败")
        } finally {
            setIsLinking(false)
        }
    }

    return (
        <>
            <div className="flex-1 space-y-6 p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">内容分析中心</h2>
                </div>

                <div className="flex justify-start">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => { setUploadMode("contract"); setUploadStatus("idle"); }}
                            className={`px-4 py-1.5 text-sm rounded-md transition-all ${uploadMode === 'contract' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                        >
                            合同上传
                        </button>
                        <button
                            onClick={() => { setUploadMode("invoice"); setUploadStatus("idle"); }}
                            className={`px-4 py-1.5 text-sm rounded-md transition-all ${uploadMode === 'invoice' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                        >
                            上传发票
                        </button>
                        <button
                            onClick={() => { setUploadMode("payment"); setUploadStatus("idle"); }}
                            className={`px-4 py-1.5 text-sm rounded-md transition-all ${uploadMode === 'payment' ? 'bg-white shadow text-green-600 font-bold' : 'text-gray-500'}`}
                        >
                            货款录入
                        </button>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                    <Card className="col-span-3">
                        <CardHeader>
                            <CardTitle>
                                {uploadMode === 'contract' ? '信息智能识别' : uploadMode === 'invoice' ? '发票对账识别' : '货款记录录入'}
                            </CardTitle>
                            <CardDescription>
                                {uploadMode === 'contract'
                                    ? '支持 PDF 合同、协议或图片。AI 将自动识别项目及设备技术参数。'
                                    : uploadMode === 'invoice'
                                        ? '识别发票并将金额自动录入对应合同。支持购方模糊匹配与冲突提醒。'
                                        : '手动录入收到的货款金额，将自动关联至合同管理中的付款记录。'
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {uploadMode === 'payment' ? (
                                <div className="flex flex-col space-y-4">
                                    <div className="space-y-2">
                                        <Label>选择关联项目</Label>
                                        <div className="relative group/search">
                                            <Input
                                                placeholder="搜索项目名称或合同号..."
                                                value={paymentSearchTerm}
                                                onChange={(e) => {
                                                    setPaymentSearchTerm(e.target.value);
                                                    if (selectedProjectId) setSelectedProjectId("");
                                                }}
                                                className="pr-10"
                                            />
                                            <Clock className="w-4 h-4 absolute right-3 top-3 text-gray-400 group-focus-within/search:text-blue-500 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="relative">
                                        {paymentSearchTerm && !selectedProjectId && (
                                            <div className="absolute z-50 w-full left-0 bg-white border rounded-md mt-1 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="max-h-[300px] overflow-y-auto">
                                                    {allProjects
                                                        .filter(p => {
                                                            const term = paymentSearchTerm.toLowerCase();
                                                            return p.name.toLowerCase().includes(term) ||
                                                                (p.contractNumber && p.contractNumber.toLowerCase().includes(term));
                                                        })
                                                        .map(p => (
                                                            <div
                                                                key={p.id}
                                                                className="group flex flex-col p-3 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 transition-all duration-200 border-l-2 border-l-transparent hover:border-l-blue-500"
                                                                onClick={() => {
                                                                    setSelectedProjectId(p.id)
                                                                    setSelectedProjectAmount(p.amount)
                                                                    setPaymentSearchTerm(`${p.name} (${p.contractNumber || '无合同号'})`)
                                                                }}
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-bold text-gray-900 group-hover:text-blue-700 truncate">{p.name}</div>
                                                                        <div className="text-xs text-gray-500 mt-1">合同号: {p.contractNumber || '无'}</div>
                                                                    </div>
                                                                    <div className="shrink-0 ml-2">
                                                                        <div className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">选择</div>
                                                                    </div>
                                                                </div>

                                                                {/* 展开预览内容 (Hover 时显示) */}
                                                                <div className="max-h-0 overflow-hidden group-hover:max-h-[200px] transition-all duration-300 ease-in-out">
                                                                    <div className="mt-3 pt-2 border-t border-blue-100/50 space-y-2">
                                                                        <div className="flex justify-between text-[11px] items-center">
                                                                            <span className="text-gray-400 flex items-center">
                                                                                <Clock className="w-3 h-3 mr-1" />
                                                                                签订日期:
                                                                            </span>
                                                                            <span className="text-blue-700 font-medium">
                                                                                {p.contractSignDate ? format(new Date(p.contractSignDate), 'yyyy-MM-dd') : '未记录'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="text-gray-400 text-[11px]">设备清单 ({p.devices?.length || 0}):</div>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {p.devices && p.devices.length > 0 ? (
                                                                                    p.devices.map((d: any) => (
                                                                                        <span key={d.id} className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] bg-white border border-blue-100 text-blue-600 font-medium">
                                                                                            {d.category} <span className="ml-1 text-blue-400">x{d.quantity}</span>
                                                                                        </span>
                                                                                    ))
                                                                                ) : (
                                                                                    <span className="text-[10px] text-gray-300 italic">无设备记录</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col space-y-2">
                                            <div className="flex items-center justify-between h-8">
                                                <Label>货款录入方式</Label>
                                                <div className="flex items-center space-x-1 bg-gray-100 p-0.5 rounded text-xs">
                                                    <button
                                                        onClick={() => setPaymentInputMode('amount')}
                                                        className={`px-2 py-1 rounded-sm transition-colors ${paymentInputMode === 'amount' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900'}`}
                                                    >
                                                        固定金额
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (selectedProjectAmount) {
                                                                setPaymentInputMode('percentage')
                                                            }
                                                        }}
                                                        disabled={!selectedProjectAmount}
                                                        className={`px-2 py-1 rounded-sm transition-colors ${!selectedProjectAmount ? 'opacity-50 cursor-not-allowed' : paymentInputMode === 'percentage' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900'}`}
                                                        title={!selectedProjectAmount ? "该项目暂无合同总额记录，无法按百分比计算" : ""}
                                                    >
                                                        按百分比
                                                    </button>
                                                </div>
                                            </div>

                                            {paymentInputMode === 'amount' ? (
                                                <Input
                                                    type="number"
                                                    placeholder="输入金额 (元)"
                                                    value={paymentAmount}
                                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                                />
                                            ) : (
                                                <div className="space-y-1">
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            placeholder="输入比例 (如 30，代表 30%)"
                                                            value={paymentPercentage}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setPaymentPercentage(val);
                                                                if (val && selectedProjectAmount) {
                                                                    const calculated = (selectedProjectAmount * parseFloat(val) / 100).toFixed(2);
                                                                    setPaymentAmount(calculated);
                                                                } else {
                                                                    setPaymentAmount("");
                                                                }
                                                            }}
                                                            className="pr-8"
                                                        />
                                                        <span className="absolute right-3 top-2.5 text-gray-500">%</span>
                                                    </div>
                                                    {paymentPercentage && selectedProjectAmount && (
                                                        <div className="text-xs text-blue-600 px-1 font-medium">
                                                            折算金额: ¥{paymentAmount}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col space-y-2">
                                            <div className="flex items-center h-8">
                                                <Label>款项日期</Label>
                                            </div>
                                            <Input
                                                type="date"
                                                value={paymentDate}
                                                onChange={(e) => setPaymentDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>付款备注</Label>
                                        <Input
                                            placeholder="输入付款事由、备注信息等（将同步至表格）"
                                            value={paymentNote}
                                            onChange={(e) => setPaymentNote(e.target.value)}
                                        />
                                    </div>
                                    {uploadStatus === "error" && (
                                        <div className="text-sm text-red-500 flex items-center">
                                            <AlertCircle className="w-4 h-4 mr-2" />
                                            {errorMessage}
                                        </div>
                                    )}
                                    {uploadStatus === "success" && (
                                        <div className="text-sm text-green-600 flex items-center bg-green-50 p-2 rounded">
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            货款记录已录入并同步至合同表
                                        </div>
                                    )}
                                    <Button
                                        className="w-full bg-green-600 hover:bg-green-700"
                                        onClick={handlePaymentSubmit}
                                        disabled={!selectedProjectId || !paymentAmount || isUploading}
                                    >
                                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "确认录入货款"}
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-4">
                                    <div
                                        className={`flex flex-col items-center justify-center w-full min-h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                      ${files.length > 0 ? 'border-blue-500 bg-blue-50/50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                                    >
                                        <Label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-full cursor-pointer py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                {uploadStatus === "success" ? (
                                                    <CheckCircle2 className="w-8 h-8 mb-2 text-green-500" />
                                                ) : (
                                                    <UploadCloud className={`w-8 h-8 mb-2 ${files.length > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
                                                )}

                                                <p className="mb-1 text-sm text-gray-500">
                                                    {files.length > 0 ? (
                                                        <span className="font-semibold text-blue-600">已选择 {files.length} 个文件</span>
                                                    ) : (
                                                        <><span className="font-semibold">点击上传</span> 或拖拽文件至此</>
                                                    )}
                                                </p>
                                                <p className="text-xs text-gray-400">PDF, JPG, PNG {uploadMode === 'invoice' && '(支持多选)'}</p>
                                            </div>
                                            <Input
                                                id="dropzone-file"
                                                type="file"
                                                className="hidden"
                                                accept=".pdf,image/*"
                                                onChange={handleFileChange}
                                                disabled={isUploading}
                                                multiple={uploadMode === 'invoice'}
                                            />
                                        </Label>
                                    </div>

                                    {/* 文件队列列表 */}
                                    {uploadQueue.length > 0 && (
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                            {uploadQueue.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between p-2 rounded bg-white border text-xs">
                                                    <div className="flex items-center space-x-2 truncate flex-1">
                                                        <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate" title={item.fileName}>{item.fileName}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2 ml-2">
                                                        {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                                                        {item.status === 'success' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                                        {item.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                                                        {item.status === 'collision' && <AlertCircle className="w-3 h-3 text-orange-500" />}
                                                        {item.status === 'waiting' && !isUploading && (
                                                            <button
                                                                onClick={(e) => { e.preventDefault(); removeFile(item.id); }}
                                                                className="text-gray-400 hover:text-red-500"
                                                            >
                                                                删除
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {uploadStatus === "error" && (
                                        <div className="flex items-center text-sm text-red-500">
                                            <AlertCircle className="w-4 h-4 mr-2" />
                                            {errorMessage}
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleUpload}
                                        className="w-full"
                                        disabled={files.length === 0 || isUploading}
                                    >
                                        {isUploading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                系统识别与验证中...
                                            </>
                                        ) : uploadStatus === "success" ? (
                                            "继续上传下一份"
                                        ) : (
                                            `开始解析${uploadMode === 'contract' ? '合同' : '批次发票'}`
                                        )}
                                    </Button>

                                    {uploadMode === 'contract' && files[0] && files[0].type === "application/pdf" && (
                                        <div className="mt-4 border-t pt-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <Label className="text-sm font-semibold">选择包含有效数据的页面</Label>
                                                <span className="text-xs text-gray-400">已选 {selectedPages.length} 页</span>
                                            </div>
                                            {isGeneratingPreviews ? (
                                                <div className="flex items-center justify-center p-8">
                                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                                                    <span className="text-xs text-gray-500">生成预览中...</span>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-4 gap-2 max-h-[240px] overflow-y-auto p-1">
                                                    {previews.map((preview) => (
                                                        <div
                                                            key={preview.page}
                                                            onClick={() => togglePage(preview.page)}
                                                            className={`relative aspect-[3/4] rounded border-2 transition-all cursor-pointer overflow-hidden
                                                            ${selectedPages.includes(preview.page) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 opacity-60 hover:opacity-100'}`}
                                                        >
                                                            <img src={preview.url} alt={`Page ${preview.page}`} className="w-full h-full object-cover" />
                                                            <div className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center
                                                            ${selectedPages.includes(preview.page) ? 'bg-blue-500 text-white' : 'bg-white/80 border border-gray-300'}`}>
                                                                {selectedPages.includes(preview.page) && <Check className="w-3 h-3" />}
                                                            </div>
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] py-0.5 text-center">
                                                                第 {preview.page} 页
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="col-span-4">
                        <CardHeader>
                            <CardTitle>近期历史解析记录</CardTitle>
                            <CardDescription>最近录入的合同及相关技术协议汇总</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingList ? (
                                <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed border-gray-200">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                </div>
                            ) : recentProjects.length === 0 ? (
                                <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed border-gray-200">
                                    <div className="flex flex-col items-center text-gray-500 text-sm">
                                        <FileText className="w-8 h-8 mb-2 text-gray-300" />
                                        暂无解析记录
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {recentProjects.map((item: any) => (
                                        <div key={item.id} className="flex flex-col p-4 border border-gray-100 rounded-lg hover:border-blue-100 transition-colors bg-gray-50/30">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="text-sm font-semibold text-gray-900">{item.name}</h4>
                                                    {item.type === 'contract' && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">信息上传</span>}
                                                    {item.type === 'invoice' && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">发票</span>}
                                                    {item.type === 'payment' && <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">货款</span>}
                                                </div>
                                                <span className="text-xs text-gray-400 flex items-center">
                                                    <Clock className="w-3 h-3 mr-1" />
                                                    {format(new Date(item.createdAt), 'yyyy/MM/dd HH:mm')}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 mb-2">
                                                <span className="font-medium text-gray-700">相关方:</span> {item.client?.name || '系统处理'}
                                            </p>
                                            {item.type === 'contract' && (
                                                <div className="flex flex-wrap gap-2">
                                                    {item.devices && item.devices.length > 0 ? (
                                                        item.devices.map((device: any) => (
                                                            <span key={device.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50/50 text-blue-600 border border-blue-100">
                                                                {device.category} x {device.quantity}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-gray-400">无设备记录</span>
                                                    )}
                                                </div>
                                            )}
                                            {item.amount && (
                                                <p className="text-xs text-orange-600 font-bold mt-1">
                                                    金额: ¥{item.amount.toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 发票冲突选择弹窗 */}
            <Dialog open={collisionData.show} onOpenChange={(open) => !isLinking && setCollisionData(prev => ({ ...prev, show: open }))}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                            无法自动关联项目
                        </DialogTitle>
                        <DialogDescription>
                            发票识别成功，但{collisionData.reason}。请确认识别信息并手动搜索或选择归属项目。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 border-y bg-gray-50/50 -mx-6 px-6">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-gray-500">识别购方：</span>
                            <span className="font-medium truncate" title={collisionData.parsed?.buyerName}>{collisionData.parsed?.buyerName}</span>
                            <span className="text-gray-500">发票金额：</span>
                            <span className="text-blue-600 font-bold">¥{collisionData.parsed?.amount?.toLocaleString()}</span>
                            <span className="text-gray-500">发票号码：</span>
                            <span>{collisionData.parsed?.invoiceNumber}</span>
                        </div>
                    </div>

                    <div className="pt-3 pb-2">
                        <div className="relative">
                            <Input
                                placeholder="搜索项目名称或合同号..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 text-xs h-8"
                            />
                            <UploadCloud className="w-3 h-3 absolute left-2.5 top-2.5 text-gray-400 rotate-180" />
                        </div>
                    </div>

                    <div className="max-h-[250px] overflow-y-auto pr-1">
                        {searchTerm.length > 0 ? (
                            <div className="space-y-2">
                                <Label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">搜索结果</Label>
                                {allProjects
                                    .filter(p =>
                                        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (p.contractNumber && p.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()))
                                    )
                                    .slice(0, 5)
                                    .map(project => (
                                        <button
                                            key={project.id}
                                            onClick={() => handleManualLink(project.id)}
                                            disabled={isLinking}
                                            className="w-full text-left p-2.5 rounded-lg border border-gray-100 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex justify-between items-center group"
                                        >
                                            <div className="flex-1 truncate mr-2">
                                                <div className="text-xs font-bold text-gray-900 truncate group-hover:text-blue-600">{project.name}</div>
                                                <div className="text-[10px] text-gray-500">{project.contractNumber || '无合同号'}</div>
                                            </div>
                                            <div className="shrink-0 p-1 px-2 text-[10px] bg-gray-100 text-gray-500 group-hover:bg-blue-600 group-hover:text-white rounded">选择</div>
                                        </button>
                                    ))
                                }
                                {allProjects.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                    <div className="py-4 text-center text-xs text-gray-400">未找到相关项目</div>
                                )}
                            </div>
                        ) : collisionData.candidates.length > 0 ? (
                            <div className="space-y-2">
                                <Label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">推荐匹配项目</Label>
                                {collisionData.candidates.map(candidate => (
                                    <button
                                        key={candidate.id}
                                        onClick={() => handleManualLink(candidate.id)}
                                        disabled={isLinking}
                                        className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-blue-500 hover:bg-blue-50/30 transition-all flex justify-between items-center group"
                                    >
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-gray-900 group-hover:text-blue-600">{candidate.name}</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">{candidate.contractNumber}</div>
                                            <div className="text-[10px] text-blue-500/70 mt-1 italic">{candidate.devices}</div>
                                        </div>
                                        <div className="shrink-0 p-1 px-2 text-[10px] bg-gray-100 text-gray-500 group-hover:bg-blue-600 group-hover:text-white rounded">选择</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-xs text-gray-400">
                                未通过购方名称自动找到匹配项目，请在上方搜索框输入项目关键字手动查找。
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
