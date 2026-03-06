"use client"
import { signOut } from "next-auth/react"

export default function SignOutButton() {
    return (
        <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm font-medium text-red-600 hover:text-red-700"
        >
            退出登录
        </button>
    )
}
