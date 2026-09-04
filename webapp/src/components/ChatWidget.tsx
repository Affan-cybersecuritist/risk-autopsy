import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Sparkles } from 'lucide-react'
import { api, type ChatMessage } from '../lib/api'

export default function ChatWidget({ llmEnabled }: { llmEnabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const question = input.trim()
    if (!question || busy) return
    setError(null)
    const next = [...messages, { role: 'user', content: question } as ChatMessage]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const { answer } = await api.chat(question, next)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (e) {
      setError(llmEnabled ? String(e) : 'Groq API key not configured on the backend yet — set GROQ_API_KEY in backend/.env to enable chat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#B8860B)', boxShadow: '0 10px 26px rgba(184,134,11,0.4)' }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed bottom-24 right-6 z-40 w-[360px] max-w-[90vw] h-[480px] max-h-[70vh] glass-card flex flex-col overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.96)' }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5 flex-none">
              <Sparkles size={16} className="text-[#B8860B]" />
              <div className="font-bold text-sm">Ask about this data</div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-neutral-400">
                  Ask a question grounded in the actual computed pipeline output — e.g. "why was policy v2 flagged for the 5-15k segment?"
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-[13px] leading-relaxed rounded-xl px-3 py-2 max-w-[88%] ${
                  m.role === 'user' ? 'ml-auto text-white' : 'bg-black/[0.04] text-neutral-800'
                }`} style={m.role === 'user' ? { background: 'linear-gradient(135deg,#D4AF37,#B8860B)' } : {}}>
                  {m.content}
                </div>
              ))}
              {busy && <div className="text-[13px] text-neutral-400">Thinking…</div>}
              {error && <div className="text-[12px] text-[#B23A48] bg-[#B23A48]/8 rounded-lg px-3 py-2">{error}</div>}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 px-3 py-3 border-t border-black/5 flex-none">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask a question…"
                className="input flex-1 !py-2 text-sm"
              />
              <button onClick={send} disabled={busy} className="gold-btn w-9 h-9 rounded-lg flex items-center justify-center flex-none">
                <Send size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
