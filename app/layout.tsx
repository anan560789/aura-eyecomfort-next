import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Aura EyeGym | 數位視覺復健中心',
  description: '專屬您的數位眼科與視覺復健中心',
  openGraph: {
    title: 'Aura EyeGym | 數位視覺復健中心',
    description: '結合 AI 動眼追蹤與專利演算法的專屬復健系統',
    siteName: 'Aura EyeGym',
    images: [
      {
        url: '/opengraph-image.jpg', // 這裡會自動去對應 public 資料夾內的圖片
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
