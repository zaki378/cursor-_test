import { useEffect, useRef, useState } from 'react'
import './App.css'
import { safeInvoke as invoke } from './lib/invoke'

// Types aligned with backend
export type SecurityMasterMode = 'standard' | 'strict' | 'flexible'
export type MaskStrength = 'strict' | 'standard' | 'relaxed'
export type RegionPreference = 'jp' | 'nearest'
export type DlpAction = 'mask' | 'warn' | 'block'

export interface AppSettings {
  settingsVersion: number
  securityMasterMode: SecurityMasterMode
  enableGemini: boolean
  noSave: boolean
  encryptTempFiles: boolean
  autoClearClipboard: boolean
  clearAllOnExit: boolean
  maskStrength: MaskStrength
  maskPhone: boolean
  maskEmail: boolean
  maskAddress: boolean
  maskNumbers: boolean
  maskNames: boolean
  whitelistWords: string[]
  sendTextOnlyToGemini: true
  disableDataTraining: boolean
  regionPreference: RegionPreference
  useBYOKey: boolean
  saveEmailDisplayName: boolean
  shortLivedSession: boolean
  clearTokensOnLogout: boolean
  enableErrorLogs: boolean
  enableUsageStats: boolean
  autoDeleteLogsAfterDays: 90
  enableDLPScan: boolean
  dlpAction: DlpAction
  offlineMode: boolean
  naturalizeExpressions: boolean
  autoPunctuation: boolean
  unifyForeignWords: boolean
  preserveOriginalProperNouns: boolean
  noSummaryOrEmbellishment: boolean
  customReplaceRules: { pattern: string; replace: string; flags?: string }[]
}

const DEFAULTS: AppSettings = {
  settingsVersion: 1,
  securityMasterMode: 'standard',
  enableGemini: true,
  noSave: true,
  encryptTempFiles: true,
  autoClearClipboard: true,
  clearAllOnExit: true,
  maskStrength: 'standard',
  maskPhone: true,
  maskEmail: true,
  maskAddress: true,
  maskNumbers: true,
  maskNames: false,
  whitelistWords: [],
  sendTextOnlyToGemini: true,
  disableDataTraining: true,
  regionPreference: 'nearest',
  useBYOKey: true,
  saveEmailDisplayName: false,
  shortLivedSession: true,
  clearTokensOnLogout: true,
  enableErrorLogs: false,
  enableUsageStats: false,
  autoDeleteLogsAfterDays: 90,
  enableDLPScan: true,
  dlpAction: 'mask',
  offlineMode: false,
  naturalizeExpressions: true,
  autoPunctuation: true,
  unifyForeignWords: true,
  preserveOriginalProperNouns: true,
  noSummaryOrEmbellishment: true,
  customReplaceRules: [],
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked} />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle">
      <div className="toggle-label">{label}</div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function Accordion({ icon, title, children, defaultOpen = true }: { icon: string; title: string; children: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-icon">{icon}</div>
        <h3>{title}</h3>
        <div className={`chevron ${open ? 'open' : ''}`}>▶</div>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  )
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS) as any
  const [loading, setLoading] = useState(true)
  const [pttState, setPttState] = useState<'idle' | 'recording' | 'processing' | 'error'>('idle')
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [interimText, setInterimText] = useState('')
  const [finalText, setFinalText] = useState('')

  useEffect(() => {
    invoke<AppSettings>('settings_get').then((s) => {
      // backend uses snake_case; convert lightly if needed. For now trust same keys via serde rename
      setSettings({ ...DEFAULTS, ...s } as any)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unlisten = (window as any).__TAURI__?.event?.listen?.('ptt:stateChanged', (e: any) => {
      if (e?.payload === 'recording') startRecording()
      if (e?.payload === 'processing') stopRecording()
    })
    return () => { if (typeof unlisten === 'function') unlisten() }
  }, [settings])

  const update = (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial }
    setSettings(next)
    invoke<AppSettings>('settings_update', { partial }).catch(() => {})
  }

  const startRecording = async () => {
    if (pttState !== 'idle') return
    setFinalText('')
    setInterimText('')
    setPttState('recording')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    const mr = new MediaRecorder(stream)
    mediaRecorderRef.current = mr
    audioChunksRef.current = []
    // simple fake interim update to show realtime UX; in production, wire STT streaming
    const interimTimer = setInterval(() => {
      setInterimText((t) => (t ? t + ' …' : '…'))
    }, 500)
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
    mr.onstop = async () => {
      clearInterval(interimTimer)
      setPttState('processing')
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const b64 = await blobToBase64(blob)
      const stt = await invoke<string>('stt_transcribe_once', { settings, audioB64: b64 })
      setInterimText('')
      setFinalText(stt)
      const formatted = await invoke<string>('nlp_gemini_format', { settings, text: stt })
      await invoke('clipboard_set', { text: formatted })
      await invoke('input_paste')
      if (settings.autoClearClipboard) { await invoke('clipboard_clear').catch(() => {}) }
      setPttState('idle')
    }
    mr.start()
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
  }

  // Keyboard: Alt+Space press/hold → start; on keyup → stop (browser can't get global). For demo, use UI button

  if (loading) return <div className="container">Loading...</div>

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <h2>Push-To-Talk App</h2>
        </div>
        <div className="preset">
          <label>Preset</label>
          <select value={settings.securityMasterMode} onChange={(e) => update({ securityMasterMode: e.target.value as SecurityMasterMode })}>
            <option value="standard">standard</option>
            <option value="strict">strict</option>
            <option value="flexible">flexible</option>
          </select>
        </div>
      </div>

      <div className="hero">
        <button
          className={`ptt-btn ${pttState}`}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={pttState !== 'idle' && pttState !== 'recording'}
        >
          {pttState === 'idle' && 'Hold to Talk'}
          {pttState === 'recording' && 'Recording...'}
          {pttState === 'processing' && 'Processing...'}
        </button>
        {pttState === 'recording' && (
          <button className="stop-btn" onClick={stopRecording} aria-label="Stop recording">Stop</button>
        )}
      </div>

      <div className="sections">
        <Accordion icon="📝" title="Transcript" defaultOpen>
          <div className="transcript">
            <div className="badge">Live</div>
            <textarea className="textarea" placeholder="Interim (live)" value={interimText} readOnly />
            <textarea className="textarea" placeholder="Final" value={finalText} onChange={(e) => setFinalText(e.target.value)} />
            <div className="actions">
              <button className="btn ghost" onClick={() => { setInterimText(''); setFinalText('') }}>Clear</button>
              <button className="btn" onClick={async () => { await invoke('clipboard_set', { text: finalText || interimText }); }}>Copy</button>
              <button className="btn primary" onClick={async () => { await invoke('clipboard_set', { text: finalText || interimText }); await invoke('input_paste') }}>Paste</button>
            </div>
          </div>
        </Accordion>

        <Accordion icon="✨" title="Gemini">
          <Toggle label="Enable Gemini formatting" checked={settings.enableGemini} onChange={(v) => update({ enableGemini: v })} />
          {settings.enableGemini && (
            <div className="grid">
              <Toggle label="自然な表現に整える" checked={settings.naturalizeExpressions} onChange={(v) => update({ naturalizeExpressions: v })} />
              <Toggle label="自動句読点" checked={settings.autoPunctuation} onChange={(v) => update({ autoPunctuation: v })} />
              <Toggle label="外来語の表記統一" checked={settings.unifyForeignWords} onChange={(v) => update({ unifyForeignWords: v })} />
              <Toggle label="固有名詞を保持" checked={settings.preserveOriginalProperNouns} onChange={(v) => update({ preserveOriginalProperNouns: v })} />
              <Toggle label="要約・脚色なし" checked={settings.noSummaryOrEmbellishment} onChange={(v) => update({ noSummaryOrEmbellishment: v })} />
            </div>
          )}
        </Accordion>

        <Accordion icon="🗄" title="Data Retention">
          <div className="grid">
            <Toggle label="保存しない" checked={settings.noSave} onChange={(v) => update({ noSave: v })} />
            <Toggle label="一時ファイル暗号化" checked={settings.encryptTempFiles} onChange={(v) => update({ encryptTempFiles: v })} />
            <Toggle label="貼り付け後にクリップボード自動クリア" checked={settings.autoClearClipboard} onChange={(v) => update({ autoClearClipboard: v })} />
            <Toggle label="終了時に全削除" checked={settings.clearAllOnExit} onChange={(v) => update({ clearAllOnExit: v })} />
          </div>
        </Accordion>

        <Accordion icon="🔒" title="PII Mask">
          <div className="grid">
            <div>
              <label>強度</label>
              <select value={settings.maskStrength} onChange={(e) => update({ maskStrength: e.target.value as MaskStrength })}>
                <option value="strict">strict</option>
                <option value="standard">standard</option>
                <option value="relaxed">relaxed</option>
              </select>
            </div>
            <Toggle label="電話番号" checked={settings.maskPhone} onChange={(v) => update({ maskPhone: v })} />
            <Toggle label="メール" checked={settings.maskEmail} onChange={(v) => update({ maskEmail: v })} />
            <Toggle label="住所" checked={settings.maskAddress} onChange={(v) => update({ maskAddress: v })} />
            <Toggle label="数列" checked={settings.maskNumbers} onChange={(v) => update({ maskNumbers: v })} />
            <Toggle label="氏名" checked={settings.maskNames} onChange={(v) => update({ maskNames: v })} />
          </div>
        </Accordion>

        <Accordion icon="🛰" title="API Security">
          <div className="grid">
            <div>
              <label>Text-only to Gemini（固定）</label>
              <div className="toggle"><div className="toggle-label">常にテキストのみ送信</div><div className="switch on" /></div>
            </div>
            <Toggle label="学習に利用しない" checked={settings.disableDataTraining} onChange={(v) => update({ disableDataTraining: v })} />
            <div>
              <label>リージョン</label>
              <select value={settings.regionPreference} onChange={(e) => update({ regionPreference: e.target.value as RegionPreference })}>
                <option value="nearest">nearest</option>
                <option value="jp">jp</option>
              </select>
            </div>
            <Toggle label="自前キーを使う" checked={settings.useBYOKey} onChange={(v) => update({ useBYOKey: v })} />
          </div>
        </Accordion>

        <Accordion icon="🛡" title="Runtime Guards">
          <div className="grid">
            <Toggle label="DLPスキャン" checked={settings.enableDLPScan} onChange={(v) => update({ enableDLPScan: v })} />
            <div>
              <label>アクション</label>
              <select value={settings.dlpAction} onChange={(e) => update({ dlpAction: e.target.value as DlpAction })}>
                <option value="mask">mask</option>
                <option value="warn">warn</option>
                <option value="block">block</option>
              </select>
            </div>
            <Toggle label="オフラインモード" checked={settings.offlineMode} onChange={(v) => update({ offlineMode: v })} />
          </div>
        </Accordion>

        <Accordion icon="🔑" title="API Keys">
          <KeysPanel />
        </Accordion>
      </div>

      <div className="footer">v0.1.0</div>
    </div>
  )
}

function KeysPanel() {
  const [hasGroq, setHasGroq] = useState(false)
  const [hasGemini, setHasGemini] = useState(false)
  const [groq, setGroq] = useState('')
  const [gemini, setGemini] = useState('')
  useEffect(() => {
    invoke<{ hasGroq: boolean; hasGemini: boolean }>('keys_get').then((k) => {
      setHasGroq(!!k.hasGroq)
      setHasGemini(!!k.hasGemini)
    }).catch(() => {})
  }, [])
  const save = async () => {
    await invoke('keys_set', { keys: { groqApiKey: groq || undefined, geminiApiKey: gemini || undefined } })
    setHasGroq(!!groq || hasGroq)
    setHasGemini(!!gemini || hasGemini)
    setGroq('')
    setGemini('')
    alert('Saved (stored values are hidden for security)')
  }
  return (
    <div className="grid">
      <div>
        <label>GROQ API Key {hasGroq ? '• set' : '(not set)'}</label>
        <input type="password" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="sk_... (leave blank to keep)" />
      </div>
      <div>
        <label>Gemini API Key {hasGemini ? '• set' : '(not set)'}</label>
        <input type="password" value={gemini} onChange={(e) => setGemini(e.target.value)} placeholder="AIza... (leave blank to keep)" />
      </div>
      <div style={{ display: 'flex', alignItems: 'end' }}>
        <button className="ptt-btn" onClick={save}>Save</button>
      </div>
    </div>
  )
}


function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
