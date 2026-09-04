// Local-only preferences (per-browser, not per-account) - deliberately NOT
// where credentials live. Real secrets (GROQ_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
// stay server-side in backend/.env; this only ever stores things like "should
// replies be read aloud" that are safe to keep in localStorage.

export interface VoiceOption {
  id: string
  label: string
}

// A curated slice of edge-tts's real voice catalog (300+ voices exist;
// these are the ones worth surfacing in a picker) - verified against a live
// edge_tts.list_voices() call, not guessed names.
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'en-US-AriaNeural', label: 'Aria — US, female (default)' },
  { id: 'en-US-JennyNeural', label: 'Jenny — US, female' },
  { id: 'en-US-GuyNeural', label: 'Guy — US, male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — UK, female' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — UK, male' },
  { id: 'en-IN-NeerjaNeural', label: 'Neerja — India, female' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat — India, male' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha — Australia, female' },
]

export interface Settings {
  speakByDefault: boolean
  voiceId: string
  retrainDefaultDepth: number
  retrainDefaultLeaf: number
  // Master switch for the chat widget's ability to trigger anything
  // (retrain / run the autonomous engineer / navigate) - off means it only
  // ever answers questions, exactly like a plain grounded-chat assistant,
  // for a reviewer who'd rather not have chat commands wired to real
  // pipeline actions at all. Independent of and unrelated to the
  // approve/deploy refusal, which holds either way - this is a stricter
  // opt-in the user controls, not a safety floor that can be turned off.
  commandsEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  speakByDefault: false,
  voiceId: 'en-US-AriaNeural',
  retrainDefaultDepth: 4,
  retrainDefaultLeaf: 10,
  commandsEnabled: true,
}

const STORAGE_KEY = 'risk-autopsy-settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    // Private browsing / storage disabled / corrupted value - fall back to
    // defaults rather than breaking the app over a preferences read.
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(next: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable - the setting just won't persist across reloads,
    // not worth surfacing an error for a non-critical preference.
  }
}
