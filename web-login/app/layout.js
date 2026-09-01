import './globals.css'

export const metadata = {
  title: 'Aegis Login',
  description: 'Secure login system with Turso DB',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
