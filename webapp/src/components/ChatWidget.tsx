import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Sparkles, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { api, type ChatMessage } from '../lib/api'

// Speech recognition/synthesis are the browser's own free, built-in APIs
// (Web Speech API) - no external service, no API key, nothing to sign up
// for. Not supported in every browser (Chrome/Edge yes, Firefox no), so
// every call site below checks for it and degrades to text-only.
type SpeechRecognitionType = typeof window extends { webkitSpeechRecognition: infer T } ? T : any

export type CommandResult = { handled: true; reply: string } | { handled: false }

// The one hard boundary: no command here can ever approve or deploy a
// policy. That flow requires a signed-in, face-verified human clicking
// through ApprovalModal - a chat command (typed or spoken) structurally
// cannot reach it, because no such action exists to call. This list only
// ever recognizes safe, reversible, already human-reviewed actions.
const BLOCKED_INTENT = /\b(approve|deploy|activate|push (this )?(live|to prod)|go live)\b/i
const REFUSAL_REPLY = "I can't approve or deploy a policy from here, by design — that requires a signed-in, face-verified human in the Approval Gate (section 5). Nothing in this system can skip that, including me. Want me to scroll you there instead?"
const RETRAIN_REPLY = "Retraining a new candidate now with the current depth/leaf settings — check Version History (section 4.9) in a moment."
const RUN_AGENT_REPLY = "Running the autonomous engineer now (~10s) — it'll propose candidates, attack/harden them, and register the best eligible one as a new, still-unapproved version."

// Picks a female-sounding voice from whatever the browser/OS already ships
// - still the free built-in Web Speech API, just choosing among its voices
// instead of taking the platform default (which is often male). Matches by
// name since the API exposes no gender field; these cover the common
// female voices on Windows (Zira/Aria/Jenny), macOS/iOS (Samantha/Victoria/
// Karen/Moira/Tessa/Fiona), Chrome/Android (Google US/UK English Female),
// and Amazon Polly-style names some Linux/Chrome builds ship.
const FEMALE_VOICE_HINTS = [
  'female', 'zira', 'aria', 'jenny', 'samantha', 'victoria', 'karen', 'moira',
  'tessa', 'fiona', 'susan', 'linda', 'heera', 'salli', 'joanna', 'kendra',
  'kimberly', 'ivy', 'emma', 'amy', 'google us english', 'google uk english female',
]

function pickVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  const english = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
  const pool = english.length > 0 ? english : voices
  const female = pool.find(v => FEMALE_VOICE_HINTS.some(hint => v.name.toLowerCase().includes(hint)))
  if (female) return female
  const usEnglish = pool.find(v => v.lang?.toLowerCase() === 'en-us')
  return usEnglish ?? pool[0] ?? null
}

export interface ChatCommands {
  retrain: () => void
  runAutonomousEngineer: () => void
  scrollToSection: (id: string) => boolean
}

function matchCommand(text: string, cmds: ChatCommands): CommandResult {
  const t = text.trim().toLowerCase()

  if (BLOCKED_INTENT.test(t)) {
    return { handled: true, reply: REFUSAL_REPLY }
  }

  if (/\bretrain\b/.test(t)) {
    cmds.retrain()
    return { handled: true, reply: RETRAIN_REPLY }
  }

  if (/\b(run|start)\b.*\bautonomous\b|\bautonomous engineer\b/.test(t)) {
    cmds.runAutonomousEngineer()
    return { handled: true, reply: RUN_AGENT_REPLY }
  }

  // Ordered top-to-bottom so "first"/"last" can resolve relative to actual
  // page position, not just an arbitrary object key order.
  const sectionOrder: { id: string; pattern: string }[] = [
    { id: 'sec-1', pattern: 'the loss|loss overview' },
    { id: 'sec-2', pattern: 'autopsy' },
    { id: 'sec-3', pattern: 'policy comparison|baseline' },
    { id: 'sec-4', pattern: 'adversarial test' },
    { id: 'sec-4-5', pattern: 'co.?evolution' },
    { id: 'sec-4-6', pattern: 'off.?policy' },
    { id: 'sec-4-7', pattern: 'portfolio( conflict)?|fairness' },
    { id: 'sec-4-8', pattern: 'blast radius' },
    { id: 'sec-4-9', pattern: 'version history' },
    { id: 'sec-4-10', pattern: 'drift monitor|drift' },
    { id: 'sec-4-11', pattern: 'counterfactual' },
    { id: 'sec-4-12', pattern: 'autonomous engineer' },
    { id: 'sec-4-13', pattern: 'intervention optimizer|economic' },
    { id: 'sec-4-14', pattern: 'residual( scan)?' },
    { id: 'sec-4-15', pattern: 'evaluation rigor' },
    { id: 'sec-5', pattern: 'approval gate|approval' },
    { id: 'sec-6', pattern: 'workspaces' },
  ]

  // Broad on purpose: "move to", "jump to", "scroll down to", "pull up",
  // "let's see", "next"/"back to" all mean the same thing here - a real
  // person doesn't reliably say "navigate to" just because that's the verb
  // a developer picked first.
  const NAV_TRIGGER = /\b(show|go(ing)? to|open|scroll(ing)?( to| down to| up to)?|take me to|navigate to|move to|jump to|bring me to|head to|pull up|display|let'?s see|check out|view)\b/
  if (NAV_TRIGGER.test(t)) {
    if (/\b(first|beginning|start|top)\b.*\b(page|section)\b|\b(page|section)\b.*\b(first|beginning|start|top)\b/.test(t)) {
      cmds.scrollToSection(sectionOrder[0].id)
      return { handled: true, reply: 'Scrolled to the top of the dashboard.' }
    }
    if (/\b(last|final|end)\b.*\b(page|section)\b|\b(page|section)\b.*\b(last|final|end)\b/.test(t)) {
      cmds.scrollToSection(sectionOrder[sectionOrder.length - 1].id)
      return { handled: true, reply: 'Scrolled to the last section.' }
    }
    for (const { id, pattern } of sectionOrder) {
      if (new RegExp(pattern).test(t)) {
        const ok = cmds.scrollToSection(id)
        return { handled: true, reply: ok ? `Scrolled to that section.` : `That section isn't on the page right now.` }
      }
    }
  }

  return { handled: false }
}

export default function ChatWidget({ llmEnabled, commands, speakByDefault = false, voiceId = 'en-US-AriaNeural', commandsEnabled = true }: {
  llmEnabled: boolean; commands: ChatCommands; speakByDefault?: boolean; voiceId?: string; commandsEnabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [speakEnabled, setSpeakEnabled] = useState(speakByDefault)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionType | null>(null)
  // send() is useCallback-memoized and doesn't (can't cheaply) list every
  // render-scoped function in its deps, so a plain `speak` closure captured
  // inside it can go stale and read an outdated speakEnabled. A ref sidesteps
  // that entirely - speak() below always reads the current value, regardless
  // of which stale closure is calling it.
  const speakEnabledRef = useRef(speakByDefault)
  useEffect(() => { speakEnabledRef.current = speakEnabled }, [speakEnabled])
  // Settings can change (the user opens Settings and picks a different
  // voice) after this component already mounted - read the current value
  // via a ref rather than letting speak() close over a stale voiceId.
  const voiceIdRef = useRef(voiceId)
  useEffect(() => { voiceIdRef.current = voiceId }, [voiceId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    // Chrome loads its voice list asynchronously - calling getVoices() once
    // up front (and again when the browser signals it's ready) means the
    // very first reply picks a real voice instead of falling back silently.
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
  }, [])

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  async function speak(text: string) {
    if (!speakEnabledRef.current) return
    // Prefer a real, realistic neural voice from our own free backend
    // (edge-tts - the same voices Microsoft Edge's "Read Aloud" uses, no
    // API key, no per-character cost). Only fall back to the browser's own
    // built-in (more robotic-sounding) voice if that request fails, so
    // voice replies keep working even if the backend/network is down.
    try {
      const res = await fetch(api.ttsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceIdRef.current }),
      })
      if (!res.ok) throw new Error(`tts ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      return
    } catch {
      // fall through to the browser's built-in speech synthesis below
    }
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'en-US'
    utter.rate = 1.05
    const voice = pickVoice()
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
  }

  const send = useCallback(async (overrideText?: string) => {
    const question = (overrideText ?? input).trim()
    if (!question || busy) return
    setError(null)
    const next = [...messages, { role: 'user', content: question } as ChatMessage]
    setMessages(next)
    setInput('')

    // Safe commands (retrain, run the autonomous engineer, navigate) are
    // matched client-side and executed directly against functions already
    // wired to real backend calls - never sent to the LLM, since the LLM
    // must never be the thing deciding to trigger an action. Settings can
    // turn this whole layer off (commandsEnabled) for a reviewer who'd
    // rather chat only ever answer questions - independent of and stricter
    // than the approve/deploy refusal below, which holds either way.
    const cmd = commandsEnabled ? matchCommand(question, commands) : { handled: false as const }
    if (cmd.handled) {
      setMessages([...next, { role: 'assistant', content: cmd.reply }])
      speak(cmd.reply)
      return
    }

    // The client-side matcher only recognizes phrasings we anticipated -
    // real requests ("can you move to the last page?") vary more than any
    // fixed keyword list can cover. Fall back to the LLM classifying intent
    // server-side (backend/llm.py::classify_command_intent) - its output
    // enum structurally has no "approve"/"deploy" member, and this is
    // re-checked against the same BLOCKED_INTENT guard regardless, so
    // nothing here can talk its way into an action this app doesn't allow.
    // If the endpoint itself fails (no Groq key, network), this silently
    // falls through to the normal grounded chat below.
    if (commandsEnabled && !BLOCKED_INTENT.test(question.toLowerCase())) {
      try {
        const result = await api.commandIntent(question)
        if (result.intent === 'navigate' && result.section_id) {
          const ok = commands.scrollToSection(result.section_id)
          const reply = ok ? 'Scrolled to that section.' : "That section isn't on the page right now."
          setMessages([...next, { role: 'assistant', content: reply }])
          speak(reply)
          return
        }
        if (result.intent === 'retrain') {
          commands.retrain()
          setMessages([...next, { role: 'assistant', content: RETRAIN_REPLY }])
          speak(RETRAIN_REPLY)
          return
        }
        if (result.intent === 'run_agent') {
          commands.runAutonomousEngineer()
          setMessages([...next, { role: 'assistant', content: RUN_AGENT_REPLY }])
          speak(RUN_AGENT_REPLY)
          return
        }
      } catch {
        // command-intent endpoint unavailable - degrade to normal chat,
        // same as every other AI feature in this app when Groq is down.
      }
    }

    setBusy(true)
    try {
      const { answer } = await api.chat(question, next)
      setMessages([...next, { role: 'assistant', content: answer }])
      speak(answer)
    } catch (e) {
      setError(llmEnabled ? String(e) : 'Groq API key not configured on the backend yet — set GROQ_API_KEY in backend/.env to enable chat.')
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, busy, messages, llmEnabled, commands, commandsEnabled])

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) send(transcript)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 10px 26px rgba(43,93,94,0.4)' }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="bottom-24 right-6 z-40 w-[360px] max-w-[90vw] h-[480px] max-h-[70vh] glass-card flex flex-col overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.96)', position: 'fixed' }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5 flex-none">
              <Sparkles size={16} className="text-[#2B5D5E]" />
              <div className="font-bold text-sm flex-1">Ask about this data</div>
              <button
                onClick={() => setSpeakEnabled(s => { if (s) window.speechSynthesis?.cancel(); return !s })}
                title={speakEnabled ? 'Voice replies on — click to mute' : 'Voice replies off — click to enable'}
                className="text-neutral-400 hover:text-[#2B5D5E] transition-colors"
              >
                {speakEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-neutral-400">
                  Ask a question grounded in the actual computed pipeline output{commandsEnabled
                    ? <>, or give a command — "retrain a candidate," "run the autonomous engineer," "show me blast radius." Try the mic for voice.</>
                    : <> (chat commands are off — Settings can turn them back on). Try the mic for voice.</>}
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-[13px] leading-relaxed rounded-xl px-3 py-2 max-w-[88%] ${
                  m.role === 'user' ? 'ml-auto text-white' : 'bg-black/[0.04] text-neutral-800'
                }`} style={m.role === 'user' ? { background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)' } : {}}>
                  {m.content}
                </div>
              ))}
              {busy && <div className="text-[13px] text-neutral-400">Thinking…</div>}
              {error && <div className="text-[12px] text-[#A6392F] bg-[#A6392F]/8 rounded-lg px-3 py-2">{error}</div>}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 px-3 py-3 border-t border-black/5 flex-none">
              {voiceSupported && (
                <button
                  onClick={toggleListening}
                  title={listening ? 'Stop listening' : 'Speak your question'}
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-none transition-colors"
                  style={listening
                    ? { background: 'rgba(166,57,47,0.12)', color: '#A6392F' }
                    : { background: 'rgba(43,93,94,0.08)', color: '#2B5D5E' }}
                >
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={listening ? 'Listening…' : 'Ask a question…'}
                className="input flex-1 !py-2 text-sm"
              />
              <button onClick={() => send()} disabled={busy} className="gold-btn w-9 h-9 rounded-lg flex items-center justify-center flex-none">
                <Send size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
