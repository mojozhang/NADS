"use server"

import prisma from "@/lib/prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function getTodos() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const todos = await prisma.todo.findMany({
            orderBy: [
                { completed: 'asc' },
                { createdAt: 'desc' }
            ]
        })
        return { success: true, data: todos }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function addTodo(content: string, receiver?: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const todo = await prisma.todo.create({
            data: {
                content,
                receiver,
                completed: false
            }
        })
        revalidatePath("/dashboard")
        return { success: true, data: todo }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function toggleTodo(id: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const todo = await prisma.todo.findUnique({ where: { id } })
        if (!todo) return { error: "Todo not found" }

        const updated = await prisma.todo.update({
            where: { id },
            data: { completed: !todo.completed }
        })
        revalidatePath("/dashboard")
        return { success: true, data: updated }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteTodo(id: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        await prisma.todo.delete({ where: { id } })
        revalidatePath("/dashboard")
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateTodo(id: string, content: string, receiver?: string) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return { error: "Unauthorized" }

        const updated = await prisma.todo.update({
            where: { id },
            data: { content, receiver }
        })
        revalidatePath("/dashboard")
        return { success: true, data: updated }
    } catch (error: any) {
        return { error: error.message }
    }
}
