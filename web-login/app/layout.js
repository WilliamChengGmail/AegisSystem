import './globals.css'

export const metadata = {
  title: 'Aegis System',
  description: 'Aegis System - 健康管理系統',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
