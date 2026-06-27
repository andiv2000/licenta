import React, { useState, useRef, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuthStore, useThemeStore } from '../store'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUESTIONS_BY_FACULTY: Record<string, string[]> = {
  fsgc: [
    'Cum funcționează auto-detecția versiunii FSGC (Albastru/Verde/Roșu/Galben)?',
    'Care e formula de notare pentru FSGC?',
    'Cum procesez un lot de foi FSGC în Batch Processing?',
    'Ce fac dacă auto-detecția FSGC eșuează pe o foaie?',
    'Cum creez un barem nou pentru FSGC?',
    'Ce format trebuie să aibă imaginile încărcate?',
  ],
  fpse: [
    'Care e diferența dintre varianta FPSE cu 3 și cu 4 răspunsuri?',
    'Cum funcționează auto-detecția Albastru/Verde la FPSE?',
    'Care e formula de notare pentru FPSE 3 răspunsuri (36 întrebări)?',
    'Cum procesez un lot de foi FPSE în Batch Processing?',
    'Ce se întâmplă dacă detecția versiunii FPSE eșuează?',
    'Cum creez un barem nou pentru FPSE?',
  ],
  fsas: [
    'De ce are FSAS un layout asimetric (20+15+10)?',
    'Cum funcționează detecția dinamică a secțiunilor la FSAS?',
    'Cum procesez un lot de foi FSAS în Batch Processing?',
    'Ce fac dacă secțiunile nu sunt detectate corect la FSAS?',
    'Care e formula de notare pentru FSAS?',
    'Ce format trebuie să aibă imaginile FSAS?',
  ],
  drept: [
    'Cum procesez un lot de foi Drept în Batch Processing?',
    'Care e formula de notare pentru Drept?',
    'Cum creez un barem nou pentru Drept?',
    'Ce fac dacă o foaie apare ca "Needs calibration"?',
    'Cum export rezultatele în NocoDB?',
    'Ce format trebuie să aibă imaginile încărcate?',
  ],
  sport: [
    'Care e diferența de notare față de alte facultăți la Sport?',
    'Cum procesez un lot de foi Sport în Batch Processing?',
    'Cum creez un barem nou pentru Sport?',
    'Ce fac dacă o foaie apare ca "Needs calibration"?',
    'Cum export rezultatele în NocoDB?',
    'Ce format trebuie să aibă imaginile încărcate?',
  ],
  default: [
    'Cum folosesc Batch Processing pentru a corecta mai multe foi?',
    'Cum încarc o singură foaie de răspuns?',
    'Care sunt facultățile suportate și formatele lor?',
    'Cum funcționează auto-detecția versiunii baremului?',
    'Cum export rezultatele după procesare?',
    'Ce format trebuie să aibă fișierele încărcate?',
  ],
}

function InlineText({ text, isLight }: { text: string; isLight: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} style={{
              background: isLight ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.15)',
              color: isLight ? '#4f46e5' : undefined,
              borderRadius: 4,
              padding: '1px 4px',
              fontSize: '0.85em',
              fontFamily: 'monospace',
            }}>
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '').replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s\-:|]+(\|[\s\-:|]+)*\|?$/.test(line.trim()) && line.includes('-')
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|') && line.includes('|', 1)
}

function MarkdownTable({ lines, isLight }: { lines: string[]; isLight: boolean }) {
  const sepIdx = lines.findIndex(isTableSeparator)
  const headerLines = sepIdx > 0 ? lines.slice(0, sepIdx) : [lines[0]]
  const bodyLines   = sepIdx >= 0 ? lines.slice(sepIdx + 1) : lines.slice(1)

  const headers = headerLines.flatMap(l => parseTableRow(l))
  const rows    = bodyLines.filter(l => !isTableSeparator(l) && l.trim()).map(parseTableRow)

  return (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '7px 12px',
                textAlign: 'left',
                background: isLight ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.20)',
                color: isLight ? '#4f46e5' : '#c7d2fe',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                borderBottom: isLight ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(99,102,241,0.35)',
              }}>
                <InlineText text={h} isLight={isLight} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} style={{
              background: ri % 2 === 0
                ? (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)')
                : 'transparent',
            }}>
              {cells.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '6px 12px',
                  color: isLight ? '#374151' : '#cbd5e1',
                  borderBottom: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                  verticalAlign: 'top',
                  lineHeight: 1.45,
                }}>
                  <InlineText text={cell} isLight={isLight} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownContent({ text, isLight }: { text: string; isLight: boolean }) {
  const lines = text.split('\n')

  type Block =
    | { type: 'heading1' | 'heading2' | 'heading3'; text: string; key: number }
    | { type: 'list'; items: string[]; key: number }
    | { type: 'table'; lines: string[]; key: number }
    | { type: 'para'; text: string; key: number }
    | { type: 'blank'; key: number }

  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading3', text: line.slice(4), key: i })
      i++
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading2', text: line.slice(3), key: i })
      i++
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'heading1', text: line.slice(2), key: i })
      i++
    } else if (isTableRow(line) || (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
      const tableLines: string[] = []
      while (i < lines.length && (isTableRow(lines[i]) || isTableSeparator(lines[i]))) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 1) {
        blocks.push({ type: 'table', lines: tableLines, key: i })
      }
    } else if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'list', items, key: i })
    } else if (line.trim() === '') {
      blocks.push({ type: 'blank', key: i })
      i++
    } else {
      blocks.push({ type: 'para', text: line, key: i })
      i++
    }
  }

  return (
    <>
      {blocks.map(block => {
        if (block.type === 'heading3') return (
          <div key={block.key} style={{
            fontSize: 11, fontWeight: 700,
            color: isLight ? '#6366f1' : '#a5b4fc',
            textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 4px',
          }}>
            <InlineText text={block.text} isLight={isLight} />
          </div>
        )
        if (block.type === 'heading2') return (
          <div key={block.key} style={{
            fontSize: 13, fontWeight: 700,
            color: isLight ? '#1d1d1f' : '#e2e8f0',
            borderBottom: '1px solid rgba(99,102,241,0.3)',
            paddingBottom: 4, margin: '12px 0 6px',
          }}>
            <InlineText text={block.text} isLight={isLight} />
          </div>
        )
        if (block.type === 'heading1') return (
          <div key={block.key} style={{
            fontSize: 14, fontWeight: 700,
            color: isLight ? '#4f46e5' : '#c7d2fe',
            margin: '10px 0 6px',
          }}>
            <InlineText text={block.text} isLight={isLight} />
          </div>
        )
        if (block.type === 'table') return (
          <MarkdownTable key={block.key} lines={block.lines} isLight={isLight} />
        )
        if (block.type === 'list') return (
          <ul key={block.key} style={{ margin: '4px 0', paddingLeft: 18, listStyle: 'none' }}>
            {block.items.map((item, idx) => (
              <li key={idx} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                <span style={{ color: isLight ? '#6366f1' : '#818cf8', flexShrink: 0, marginTop: 1 }}>•</span>
                <span><InlineText text={item} isLight={isLight} /></span>
              </li>
            ))}
          </ul>
        )
        if (block.type === 'blank') return <div key={block.key} style={{ height: 4 }} />
        return <div key={block.key}><InlineText text={(block as any).text} isLight={isLight} /></div>
      })}
    </>
  )
}

export const Chatbot: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const theme = useThemeStore((s) => s.theme)
  const isLight = theme === 'light'

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const faculty = (user?.faculty || '').toLowerCase()
  const suggestedQuestions = useMemo(() =>
    QUESTIONS_BY_FACULTY[faculty] || QUESTIONS_BY_FACULTY['default'],
    [faculty]
  )

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const { data } = await axios.post('/api/chat', {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      })
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Eroare de conexiune. Încearcă din nou.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const reset = () => {
    setMessages([])
    setError('')
    setInput('')
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 16,
          background: isLight ? '#ffffff' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          border: isLight ? '1px solid rgba(99,102,241,0.2)' : 'none',
          cursor: 'pointer',
          boxShadow: isLight
            ? '0 4px 16px rgba(0,0,0,0.12)'
            : '0 4px 24px rgba(99,102,241,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        title="Asistent AI"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isLight ? '#6366f1' : 'white'} strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isLight ? '#6366f1' : 'white'} strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            height: 520,
            maxHeight: 'calc(100vh - 120px)',
            borderRadius: 20,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: isLight
              ? '0 20px 60px rgba(0,0,0,0.15)'
              : '0 20px 60px rgba(0,0,0,0.4)',
            zIndex: 9998,
            background: isLight ? '#ffffff' : '#0f1219',
            border: isLight
              ? '1px solid rgba(99,102,241,0.2)'
              : '1px solid rgba(99,102,241,0.3)',
            animation: 'chatSlideUp 0.25s ease',
          }}
        >
          <style>{`
            @keyframes chatSlideUp {
              from { opacity: 0; transform: translateY(16px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .chat-msg-bubble { animation: msgFade 0.2s ease; }
            @keyframes msgFade {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .chat-input:focus { outline: none; }
            .suggestion-chip:hover {
              background: ${isLight ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.25)'} !important;
              color: ${isLight ? '#4f46e5' : '#a5b4fc'} !important;
            }
            .send-btn:hover { background: #4f46e5 !important; }
            .reset-btn:hover { color: #f87171 !important; }
          `}</style>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Asistent ExamAnalyzer</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Powered by Claude AI</div>
            </div>
            {messages.length > 0 && (
              <button
                className="reset-btn"
                onClick={reset}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)', fontSize: 11,
                  padding: '4px 8px', borderRadius: 6, transition: 'color 0.2s',
                }}
                title="Conversație nouă"
              >
                ✦ Nou
              </button>
            )}
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(99,102,241,0.3) transparent',
            background: isLight ? '#fafafa' : undefined,
          }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                  <div style={{ color: isLight ? '#1d1d1f' : '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    Bună! Sunt asistentul tău.
                  </div>
                  <div style={{ color: isLight ? '#6e6e73' : '#64748b', fontSize: 12 }}>
                    Te ajut cu tot ce ține de ExamAnalyzer.
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      onClick={() => sendMessage(q)}
                      style={{
                        background: isLight ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        color: isLight ? '#4f46e5' : '#94a3b8',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className="chat-msg-bubble"
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)'),
                  color: msg.role === 'user'
                    ? 'white'
                    : (isLight ? '#1d1d1f' : '#e2e8f0'),
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: msg.role === 'assistant'
                    ? (isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)')
                    : 'none',
                  whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant'
                    ? <MarkdownContent text={msg.content} isLight={isLight} />
                    : msg.content
                  }
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '4px 18px 18px 18px',
                  background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
                  border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  gap: 5,
                  alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#6366f1',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                  <style>{`@keyframes pulse { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10,
                padding: '8px 12px',
                color: isLight ? '#dc2626' : '#fca5a5',
                fontSize: 12,
              }}>
                ⚠ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
            background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Scrie un mesaj..."
              disabled={loading}
              style={{
                flex: 1,
                background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 12,
                padding: '9px 14px',
                color: isLight ? '#1d1d1f' : '#e2e8f0',
                fontSize: 13,
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.6)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(99,102,241,0.2)')}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: input.trim() && !loading ? '#6366f1' : 'rgba(99,102,241,0.2)',
                border: 'none',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
