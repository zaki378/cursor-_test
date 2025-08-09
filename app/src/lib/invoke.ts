export async function safeInvoke<T = any>(cmd: string, payload?: any): Promise<T> {
  const tauri = (window as any).__TAURI__
  if (tauri?.core?.invoke) {
    return tauri.core.invoke(cmd, payload)
  }
  // Browser preview fallback
  switch (cmd) {
    case 'settings_get':
      return Promise.resolve({
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
      }) as any
    case 'settings_update':
      return Promise.resolve((payload?.partial) ?? {}) as any
    case 'stt_transcribe_once':
      return Promise.resolve('(preview) こちらはデモの文字起こしです') as any
    case 'nlp_gemini_format':
      return Promise.resolve(payload?.text ?? '') as any
    case 'clipboard_set':
    case 'clipboard_clear':
    case 'input_paste':
      return Promise.resolve() as any
    case 'keys_get':
      return Promise.resolve({}) as any
    case 'keys_set':
      return Promise.resolve() as any
    default:
      return Promise.reject(new Error(`Unsupported in preview: ${cmd}`))
  }
}