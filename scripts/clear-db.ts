import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('开始清理测试数据库...')

    try {
        // 按顺序删除以满足外键约束
        await prisma.issue.deleteMany()
        console.log('已清理 Issues 表')

        await prisma.part.deleteMany()
        console.log('已清理 Parts 表')

        await prisma.invoice.deleteMany()
        console.log('已清理 Invoices 表')

        await prisma.device.deleteMany()
        console.log('已清理 Devices 表')

        await prisma.contract.deleteMany()
        console.log('已清理 Contracts 表')

        await prisma.project.deleteMany()
        console.log('已清理 Projects 表')

        await prisma.client.deleteMany()
        console.log('已清理 Clients 表')

        console.log('数据库清理完成！用户和会话数据已保留。')
    } catch (error) {
        console.error('清理过程中发生错误:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
