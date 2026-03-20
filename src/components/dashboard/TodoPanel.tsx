"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Search, Check, Trash2, Edit2, X, Bell } from "lucide-react"
import { getTodos, addTodo, toggleTodo, deleteTodo, updateTodo } from "@/app/actions/todo"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function TodoPanel() {
    const [todos, setTodos] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [newContent, setNewContent] = useState("")
    const [newReceiver, setNewReceiver] = useState("")
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editContent, setEditContent] = useState("")
    const [editReceiver, setEditReceiver] = useState("")
    const [isAdding, setIsAdding] = useState(false)

    // 拖拽调整高度相关状态
    const [height, setHeight] = useState(400)
    const [isDragging, setIsDragging] = useState(false)
    const [startY, setStartY] = useState(0)
    const [startHeight, setStartHeight] = useState(0)

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setStartY(e.clientY)
        setStartHeight(height)
    }

    useEffect(() => {
        if (!isDragging) return
        
        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = e.clientY - startY
            // 因为是从上边框拖拽，鼠标向下移动(deltaY为正)代表高度减小
            const newHeight = startHeight - deltaY
            setHeight(Math.max(150, Math.min(newHeight, window.innerHeight * 0.8)))
        }
        
        const handleMouseUp = () => {
            setIsDragging(false)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, startY, startHeight])

    const fetchTodos = useCallback(async () => {
        const res = await getTodos()
        if (res.success && res.data) {
            setTodos(res.data)
        }
    }, [])

    useEffect(() => {
        fetchTodos()
    }, [fetchTodos])

    const handleAdd = async () => {
        if (!newContent.trim()) return
        const res = await addTodo(newContent, newReceiver)
        if (res.success) {
            setNewContent("")
            setNewReceiver("")
            setIsAdding(false)
            fetchTodos()
        }
    }

    const handleToggle = async (id: string) => {
        const res = await toggleTodo(id)
        if (res.success) {
            fetchTodos()
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("确认删除此事项吗？")) return
        const res = await deleteTodo(id)
        if (res.success) {
            fetchTodos()
        }
    }

    const startEdit = (todo: any) => {
        setEditingId(todo.id)
        setEditContent(todo.content)
        setEditReceiver(todo.receiver || "")
    }

    const handleUpdate = async () => {
        if (!editingId || !editContent.trim()) return
        const res = await updateTodo(editingId, editContent, editReceiver)
        if (res.success) {
            setEditingId(null)
            fetchTodos()
        }
    }

    const filteredTodos = todos.filter(t =>
        t.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.receiver && t.receiver.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    return (
        <div 
            className="flex flex-col border-t border-gray-100 bg-gray-50/30 relative shrink-0 transition-none"
            style={{ height: `${height}px` }}
        >
            {/* 顶部的拖拽把手区 */}
            <div 
                className="absolute top-0 left-0 right-0 h-1.5 bg-transparent hover:bg-blue-400 cursor-ns-resize z-20 transition-colors"
                onMouseDown={handleMouseDown}
            />
            {/* 为了在拖拽时防止选中文字或出现异常，可以在拖拽时给 body 增加不可选中的样式，这里偷懒用全局遮罩也是一种解法，这里暂时先依靠 handleMouseMove */}
            {isDragging && (
                <div className="fixed inset-0 z-50 cursor-ns-resize" />
            )}

            <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 pt-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-gray-800">通知栏</h3>
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <Plus className={`w-4 h-4 text-gray-500 transition-transform ${isAdding ? 'rotate-45' : ''}`} />
                    </button>
                </div>

                <div className="relative mb-2">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <Input
                        placeholder="关键字查找..."
                        className="pl-8 h-8 text-[11px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {isAdding && (
                    <div className="space-y-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-2">
                        <Input
                            placeholder="内容..."
                            className="h-8 text-[11px]"
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <Input
                                placeholder="接收人..."
                                className="h-8 text-[11px] flex-1"
                                value={newReceiver}
                                onChange={(e) => setNewReceiver(e.target.value)}
                            />
                            <Button size="sm" className="h-8 px-2" onClick={handleAdd}>添加</Button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredTodos.map((todo) => (
                    <div
                        key={todo.id}
                        className={`group p-2 rounded-lg border transition-all ${todo.completed ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 shadow-sm hover:border-blue-200'}`}
                    >
                        {editingId === todo.id ? (
                            <div className="space-y-2">
                                <Input
                                    className="h-7 text-[11px]"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <Input
                                        className="h-7 text-[11px] flex-1"
                                        value={editReceiver}
                                        onChange={(e) => setEditReceiver(e.target.value)}
                                    />
                                    <button onClick={handleUpdate} className="text-blue-600 p-1"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingId(null)} className="text-gray-400 p-1"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2">
                                <button
                                    onClick={() => handleToggle(todo.id)}
                                    className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${todo.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-400'}`}
                                >
                                    {todo.completed && <Check className="w-3 h-3 text-white" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-[12px] leading-tight break-words ${todo.completed ? 'line-through text-gray-400' : 'text-gray-700 font-medium'}`}>
                                        {todo.content}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-gray-400 font-mono">
                                            {format(new Date(todo.createdAt), 'MM/dd HH:mm')}
                                        </span>
                                        {todo.receiver && (
                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">
                                                @{todo.receiver}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                    <button onClick={() => startEdit(todo)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500"><Edit2 className="w-3 h-3" /></button>
                                    <button onClick={() => handleDelete(todo.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {filteredTodos.length === 0 && (
                    <div className="text-center py-10">
                        <p className="text-[11px] text-gray-400 italic">暂无事项</p>
                    </div>
                )}
            </div>
        </div>
    )
}
