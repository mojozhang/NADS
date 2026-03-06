import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma/client"

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const projects = await prisma.project.findMany({
            where: { status: { not: "archived" } },
            select: {
                id: true,
                name: true,
                contractNumber: true,
                contractSignDate: true,
                amount: true,
                devices: {
                    select: {
                        id: true,
                        category: true,
                        quantity: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        return NextResponse.json({ success: true, data: projects })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
