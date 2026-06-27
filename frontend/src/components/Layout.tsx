import React from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <nav className="container flex items-center justify-between h-16">
          <h1 className="text-2xl font-bold text-blue-600">ExamAnalyzer</h1>
          <div className="flex gap-4">
            
          </div>
        </nav>
      </header>
      <main className="container flex-1 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200">
        <div className="container py-6 text-center text-gray-600">
          <p>&copy; 2025 Exam Analyzer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
