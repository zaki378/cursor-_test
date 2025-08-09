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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function Section({ title, children, extra }: { title: string; children: any; extra?: any }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
        <div>{extra}</div>
      </div>
      <div className="card-body">{children}</div>
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
    setPttState('recording')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    const mr = new MediaRecorder(stream)
    mediaRecorderRef.current = mr
    audioChunksRef.current = []
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    mr.onstop = async () => {
      setPttState('processing')
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const b64 = await blobToBase64(blob)
      // const masked = await invoke<string>('mask_text', { settings: toSnakeCase(settings), input: '' }) // reserved for pre-mask before STT (not used)
      const stt = await invoke<string>('stt_transcribe_once', { settings, audioB64: b64 })
      const formatted = await invoke<string>('nlp_gemini_format', { settings, text: stt })
      await invoke('clipboard_set', { text: formatted })
      await invoke('input_paste')
      if (settings.autoClearClipboard) {
        await invoke('clipboard_clear').catch(() => {})
      }
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
      <header className="header">
        <h2>Push-To-Talk App</h2>
        <div className="preset">
          <label>Preset</label>
          <select value={settings.securityMasterMode} onChange={(e) => update({ securityMasterMode: e.target.value as SecurityMasterMode })}>
            <option value="standard">standard</option>
            <option value="strict">strict</option>
            <option value="flexible">flexible</option>
          </select>
        </div>
      </header>

      <div className="ptt">
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
      </div>

      <Section title="Gemini">
        <Toggle checked={settings.enableGemini} onChange={(v) => update({ enableGemini: v })} label="Enable Gemini formatting" />
        {settings.enableGemini && (
          <div className="grid">
            <Toggle checked={settings.naturalizeExpressions} onChange={(v) => update({ naturalizeExpressions: v })} label="自然な表現に整える" />
            <Toggle checked={settings.autoPunctuation} onChange={(v) => update({ autoPunctuation: v })} label="自動句読点" />
            <Toggle checked={settings.unifyForeignWords} onChange={(v) => update({ unifyForeignWords: v })} label="外来語の表記統一" />
            <Toggle checked={settings.preserveOriginalProperNouns} onChange={(v) => update({ preserveOriginalProperNouns: v })} label="固有名詞を保持" />
            <Toggle checked={settings.noSummaryOrEmbellishment} onChange={(v) => update({ noSummaryOrEmbellishment: v })} label="要約・脚色なし" />
          </div>
        )}
      </Section>

      <Section title="Data Retention">
        <div className="grid">
          <Toggle checked={settings.noSave} onChange={(v) => update({ noSave: v })} label="保存しない" />
          <Toggle checked={settings.encryptTempFiles} onChange={(v) => update({ encryptTempFiles: v })} label="一時ファイル暗号化" />
          <Toggle checked={settings.autoClearClipboard} onChange={(v) => update({ autoClearClipboard: v })} label="貼り付け後にクリップボード自動クリア" />
          <Toggle checked={settings.clearAllOnExit} onChange={(v) => update({ clearAllOnExit: v })} label="終了時に全削除" />
        </div>
      </Section>

      <Section title="PII Mask">
        <div className="grid">
          <div>
            <label>強度</label>
            <select value={settings.maskStrength} onChange={(e) => update({ maskStrength: e.target.value as MaskStrength })}>
              <option value="strict">strict</option>
              <option value="standard">standard</option>
              <option value="relaxed">relaxed</option>
            </select>
          </div>
          <Toggle checked={settings.maskPhone} onChange={(v) => update({ maskPhone: v })} label="電話番号" />
          <Toggle checked={settings.maskEmail} onChange={(v) => update({ maskEmail: v })} label="メール" />
          <Toggle checked={settings.maskAddress} onChange={(v) => update({ maskAddress: v })} label="住所" />
          <Toggle checked={settings.maskNumbers} onChange={(v) => update({ maskNumbers: v })} label="数列" />
          <Toggle checked={settings.maskNames} onChange={(v) => update({ maskNames: v })} label="氏名" />
        </div>
      </Section>

      <Section title="API Security">
        <div className="grid">
          <div>Text-only to Gemini（固定）</div>
          <Toggle checked={settings.disableDataTraining} onChange={(v) => update({ disableDataTraining: v })} label="学習に利用しない" />
          <div>
            <label>リージョン</label>
            <select value={settings.regionPreference} onChange={(e) => update({ regionPreference: e.target.value as RegionPreference })}>
              <option value="nearest">nearest</option>
              <option value="jp">jp</option>
            </select>
          </div>
          <Toggle checked={settings.useBYOKey} onChange={(v) => update({ useBYOKey: v })} label="自前キーを使う" />
        </div>
      </Section>

      <Section title="Runtime Guards">
        <div className="grid">
          <Toggle checked={settings.enableDLPScan} onChange={(v) => update({ enableDLPScan: v })} label="DLPスキャン" />
          <div>
            <label>アクション</label>
            <select value={settings.dlpAction} onChange={(e) => update({ dlpAction: e.target.value as DlpAction })}>
              <option value="mask">mask</option>
              <option value="warn">warn</option>
              <option value="block">block</option>
            </select>
          </div>
          <Toggle checked={settings.offlineMode} onChange={(v) => update({ offlineMode: v })} label="オフラインモード" />
        </div>
      </Section>

      <Section title="API Keys">
        <KeysPanel />
      </Section>

      <footer className="footer">v0.1.0</footer>
    </div>
  )
}

function KeysPanel() {
  const [groq, setGroq] = useState('')
  const [gemini, setGemini] = useState('')
  useEffect(() => {
    invoke<{ groqApiKey?: string; geminiApiKey?: string }>('keys_get').then((k) => {
      setGroq(k.groqApiKey || '')
      setGemini(k.geminiApiKey || '')
    }).catch(() => {})
  }, [])
  const save = async () => {
    await invoke('keys_set', { keys: { groqApiKey: groq || null, geminiApiKey: gemini || null } })
    alert('Saved keys locally')
  }
  return (
    <div className="grid">
      <div>
        <label>GROQ API Key</label>
        <input type="password" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="sk_..." />
      </div>
      <div>
        <label>Gemini API Key</label>
        <input type="password" value={gemini} onChange={(e) => setGemini(e.target.value)} placeholder="AIza..." />
      </div>
      <div style={{ display: 'flex', alignItems: 'end' }}>
        <button onClick={save}>Save</button>
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
