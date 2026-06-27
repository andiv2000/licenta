import React from 'react'

export const ResultsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="hero-gradient rounded-2xl p-8 relative overflow-hidden animate-float-up mb-6">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', animation: 'pulse-ring 4s ease-in-out infinite' }} />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold mb-2 text-gradient tracking-tight">Analysis Results</h1>
          <p className="text-slate-400 text-sm">
            Vizualizează rezultatele detaliate și notele studenților
          </p>
        </div>
      </div>

      <div className="glass-stat rounded-2xl p-6 animate-float-up" style={{ animationDelay: '0.08s' }}>
        <p className="text-slate-400">
          Rezultatele vor apărea aici după procesarea fișelor de examen.
        </p>
      </div>
    </div>
  )
}
