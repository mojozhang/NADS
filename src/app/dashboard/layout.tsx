import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import SignOutButton from "@/components/auth/SignOutButton"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
        redirect('/login')
    }

    return (
        <div className="flex h-screen w-full bg-gray-50/50">
            {/* 侧边栏 */}
            <aside className="w-64 border-r border-gray-200 bg-white shadow-sm flex flex-col h-full">
                <div className="flex h-16 items-center border-b border-gray-100 px-6 shrink-0">
                    <img src="/logo.jpg" alt="GAODE" className="h-8 w-auto object-contain" />
                </div>
                <nav className="p-4 space-y-1 overflow-y-auto flex-1">
                    <a href="/dashboard" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                        <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        项目概览
                    </a>
                    <a href="/dashboard/contracts" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                        <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        信息上传
                    </a>
                    <a href="/dashboard/contracts-table" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                        <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 18h18M3 6h18" />
                        </svg>
                        合同管理
                    </a>
                    <a href="/dashboard/purchases" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                        <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        采购成本
                    </a>
                    <a href="/dashboard/knowledge" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                        <svg className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        专家知识库
                    </a>
                </nav>
            </aside>

            {/* 主体区域与顶部导航 */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-8 shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">
                        NADS <span className="text-lg font-normal text-gray-500">V0.9.7</span>
                    </h2>
                    <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-500">{session.user.email}</span>
                        <SignOutButton />
                    </div>
                </header>

                {/* 页面内容在可滚动的容器内渲染 */}
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}
