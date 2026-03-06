
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma/client"
import bcrypt from "bcryptjs"
import { AuthOptions } from "next-auth"

export const authOptions: AuthOptions = {
    adapter: PrismaAdapter(prisma) as any,
    providers: [
        CredentialsProvider({
            name: "本地系统账号",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "admin@example.com" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials, _req) {
                if (!credentials?.email || !credentials?.password) {
                    return null
                }

                const user = await prisma.user.findUnique({
                    where: {
                        email: credentials.email
                    }
                })

                if (!user || (!user.password && user.email !== "admin@example.com")) {
                    // 如果数据库没有密码且不是内置保留账号处理
                    if (credentials.email === "admin@example.com" && credentials.password === "123456") {
                        // 预留的写死账户方便测试登录，等第一版过了可以去掉
                        const mockUser = { id: "1", name: "Administrator", email: "admin@example.com", role: "admin" }
                        return mockUser
                    }
                    return null
                }

                // 验证用户密码 (可选的逻辑)
                if (user && user.password) {
                    const isPasswordValid = await bcrypt.compare(
                        credentials.password,
                        user.password
                    )

                    if (!isPasswordValid) {
                        return null
                    }
                }

                return user
            }
        })
    ],
    session: {
        strategy: "jwt" as const,
    },
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async session({ session, token }: { session: any; token: any }) {
            if (token && session.user) {
                session.user.id = token.id
                session.user.role = token.role
            }
            return session
        },
        async jwt({ token, user }: { token: any; user: any }) {
            if (user) {
                token.id = user.id
                token.role = user.role
            }
            return token
        }
    }
}
