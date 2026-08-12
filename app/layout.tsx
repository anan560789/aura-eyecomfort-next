import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  // 加上這行：告訴 Next.js 你的網站真實網域在哪裡
  metadataBase: new URL('https://aura-eyecomfort-next.pages.dev'),
  title: 'Aura EyeGym | 數位視覺復健中心',
  description: '專屬您的數位眼科與視覺復健中心',
  openGraph: {
    title: 'Aura EyeGym | 數位視覺復健中心',
    description: '結合 AI 動眼追蹤與專利演算法的專屬復健系統',
    siteName: 'Aura EyeGym',
    images: [
      {
        // 改成這行：直接塞給它包含 https 的「絕對路徑」完整網址！
        url: 'https://aura-eyecomfort-next.pages.dev/opengraph-image.jpg',
        width: 1200,
        height: 630,
      },
    ],
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
