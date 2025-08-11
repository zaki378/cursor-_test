use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub settings_version: u32,
    pub security_master_mode: String,
    pub enable_gemini: bool,
    pub no_save: bool,
    pub encrypt_temp_files: bool,
    pub auto_clear_clipboard: bool,
    pub clear_all_on_exit: bool,
    pub mask_strength: String,
    pub mask_phone: bool,
    pub mask_email: bool,
    pub mask_address: bool,
    pub mask_numbers: bool,
    pub mask_names: bool,
    pub whitelist_words: Vec<String>,
    pub send_text_only_to_gemini: bool,
    pub disable_data_training: bool,
    pub region_preference: String,
    pub use_byo_key: bool,
    pub save_email_display_name: bool,
    pub short_lived_session: bool,
    pub clear_tokens_on_logout: bool,
    pub enable_error_logs: bool,
    pub enable_usage_stats: bool,
    pub auto_delete_logs_after_days: u32,
    pub enable_dlp_scan: bool,
    pub dlp_action: String,
    pub offline_mode: bool,
    pub naturalize_expressions: bool,
    pub auto_punctuation: bool,
    pub unify_foreign_words: bool,
    pub preserve_original_proper_nouns: bool,
    pub no_summary_or_embellishment: bool,
    pub custom_replace_rules: Vec<ReplaceRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplaceRule {
    pub pattern: String,
    pub replace: String,
    pub flags: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            settings_version: 1,
            security_master_mode: "standard".into(),
            enable_gemini: true,
            no_save: true,
            encrypt_temp_files: true,
            auto_clear_clipboard: true,
            clear_all_on_exit: true,
            mask_strength: "standard".into(),
            mask_phone: true,
            mask_email: true,
            mask_address: true,
            mask_numbers: true,
            mask_names: false,
            whitelist_words: vec![],
            send_text_only_to_gemini: true,
            disable_data_training: true,
            region_preference: "nearest".into(),
            use_byo_key: true,
            save_email_display_name: false,
            short_lived_session: true,
            clear_tokens_on_logout: true,
            enable_error_logs: false,
            enable_usage_stats: false,
            auto_delete_logs_after_days: 90,
            enable_dlp_scan: true,
            dlp_action: "mask".into(),
            offline_mode: false,
            naturalize_expressions: true,
            auto_punctuation: true,
            unify_foreign_words: true,
            preserve_original_proper_nouns: true,
            no_summary_or_embellishment: true,
            custom_replace_rules: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Keys { pub groq_api_key: Option<String>, pub gemini_api_key: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KeysPresence { pub has_groq: bool, pub has_gemini: bool }

#[derive(Default)]
struct AppState {
    settings: Mutex<AppSettings>,
    settings_path: Mutex<Option<PathBuf>>,
    recording_active: Mutex<bool>,
}

fn save_settings_to_disk(path: &PathBuf, s: &AppSettings) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(path, data).map_err(|e| e.to_string())
}

fn load_settings_from_disk(path: &PathBuf) -> Option<AppSettings> {
    fs::read(path).ok().and_then(|d| serde_json::from_slice(&d).ok())
}

fn secrets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

fn read_keys_from_file(app: &AppHandle) -> Result<Keys, String> {
    let path = secrets_path(app)?;
    Ok(fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Keys>(&b).ok()).unwrap_or_default())
}

fn write_keys_to_file(app: &AppHandle, keys: &Keys) -> Result<(), String> {
    let path = secrets_path(app)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    // If both keys are None or empty, remove file
    if keys.groq_api_key.as_ref().map(|s| s.is_empty()).unwrap_or(true)
        && keys.gemini_api_key.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
        let _ = fs::remove_file(&path);
        return Ok(())
    }
    let data = serde_json::to_vec_pretty(&keys).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    // Restrict permissions to user-only (0600) where supported
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn keys_get(app: AppHandle) -> Result<KeysPresence, String> {
    let k = read_keys_from_file(&app)?;
    Ok(KeysPresence { has_groq: k.groq_api_key.is_some(), has_gemini: k.gemini_api_key.is_some() })
}

#[tauri::command]
fn keys_set(app: AppHandle, keys: Keys) -> Result<(), String> {
    let mut current = read_keys_from_file(&app)?;
    if let Some(v) = keys.groq_api_key { if !v.is_empty() { current.groq_api_key = Some(v); } }
    if let Some(v) = keys.gemini_api_key { if !v.is_empty() { current.gemini_api_key = Some(v); } }
    write_keys_to_file(&app, &current)
}

#[tauri::command]
fn keys_clear(app: AppHandle, which: Option<String>) -> Result<(), String> {
    let mut current = read_keys_from_file(&app)?;
    match which.as_deref() {
        Some("groq") => current.groq_api_key = None,
        Some("gemini") => current.gemini_api_key = None,
        _ => { current.groq_api_key = None; current.gemini_api_key = None; }
    }
    write_keys_to_file(&app, &current)
}

#[tauri::command]
fn settings_get(state: State<AppState>) -> Result<AppSettings, String> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
fn settings_update(app: AppHandle, state: State<AppState>, partial: serde_json::Value) -> Result<AppSettings, String> {
    let mut s = state.settings.lock().unwrap();
    let mut v = serde_json::to_value(&*s).map_err(|e| e.to_string())?;
    merge(&mut v, &partial);
    *s = serde_json::from_value(v).map_err(|e| e.to_string())?;
    if let Some(path) = state.settings_path.lock().unwrap().clone() {
        let _ = save_settings_to_disk(&path, &s);
    }
    // reflect potential UI consumers
    let _ = app.emit("settings:updated", &*s);
    Ok(s.clone())
}

fn merge(a: &mut serde_json::Value, b: &serde_json::Value) {
    use serde_json::Value::{Array, Object};
    match (a, b) {
        (Object(a_map), Object(b_map)) => {
            for (k, v) in b_map { merge(a_map.entry(k.clone()).or_insert(serde_json::Value::Null), v); }
        }
        (Array(a_arr), Array(b_arr)) => { *a_arr = b_arr.clone(); }
        (a_slot, b_val) => { *a_slot = b_val.clone(); }
    }
}

#[tauri::command]
async fn ptt_register(_app: AppHandle, _hotkey: Option<String>) -> Result<(), String> { Ok(()) }

#[tauri::command]
async fn ptt_start(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    *state.recording_active.lock().unwrap() = true;
    app.emit("ptt:stateChanged", "recording").map_err(|e| e.to_string())?
        ; Ok(())
}

#[tauri::command]
async fn ptt_stop(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    *state.recording_active.lock().unwrap() = false;
    app.emit("ptt:stateChanged", "processing").map_err(|e| e.to_string())?
        ; Ok(())
}

#[tauri::command]
async fn clipboard_set(app: AppHandle, text: String) -> Result<(), String> {
    tauri_plugin_clipboard_manager::set_text(&app, text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_clear(app: AppHandle) -> Result<(), String> {
    tauri_plugin_clipboard_manager::clear(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn input_paste(_app: AppHandle) -> Result<(), String> {
    use enigo::{Direction, Enigo, KeyboardControllable, Key};
    let mut enigo = Enigo::new(&enigo::Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
        enigo.text("v").map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
        enigo.text("v").map_err(|e| e.to_string())?;
        enigo.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn stt_transcribe_once(_app: AppHandle, settings: AppSettings, audio_b64: String) -> Result<String, String> {
    if settings.offline_mode { return Ok(String::new()); }
    let api_key = std::env::var("GROQ_API_KEY").ok()
        .or_else(|| {
            let path = _app.path().app_config_dir().ok()?.join("secrets.json");
            fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Keys>(&b).ok()).and_then(|k| k.groq_api_key)
        });
    if api_key.is_none() { return Ok("(demo: STT disabled; set GROQ_API_KEY)".into()); }
    let api_key = api_key.unwrap();
    let client = reqwest::Client::builder().timeout(Duration::from_secs(60)).build().map_err(|e| e.to_string())?;
    let audio_bytes = base64::decode(audio_b64).map_err(|e| e.to_string())?;
    let part = reqwest::multipart::Part::bytes(audio_bytes).file_name("audio.webm").mime_str("audio/webm").map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-large-v3");
    let resp = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("STT HTTP {}", resp.status())); }
    #[derive(Deserialize)]
    struct SttResp { text: String }
    let data: SttResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data.text)
}

#[tauri::command]
async fn nlp_gemini_format(_app: AppHandle, settings: AppSettings, text: String) -> Result<String, String> {
    if !settings.enable_gemini || settings.offline_mode { return Ok(text); }
    let key = std::env::var("GEMINI_API_KEY").ok()
        .or_else(|| {
            let path = _app.path().app_config_dir().ok()?.join("secrets.json");
            fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Keys>(&b).ok()).and_then(|k| k.gemini_api_key)
        });
    if key.is_none() { return Ok(text); }
    let key = key.unwrap();
    let model = "gemini-1.5-flash-latest";
    let system_instructions = build_gemini_instructions(&settings);
    #[derive(Serialize)]
    struct ContentPart { text: String }
    #[derive(Serialize)]
    struct Content { role: String, parts: Vec<ContentPart> }
    #[derive(Serialize)]
    struct Req { contents: Vec<Content>, system_instruction: Option<Content> }
    let req = Req {
        contents: vec![Content { role: "user".into(), parts: vec![ContentPart { text }] }],
        system_instruction: Some(Content { role: "system".into(), parts: vec![ContentPart { text: system_instructions }] }),
    };
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, key);
    let client = reqwest::Client::new();
    let resp = client.post(url).json(&req).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("Gemini HTTP {}", resp.status())); }
    #[derive(Deserialize)]
    struct CandidatePart { text: Option<String> }
    #[derive(Deserialize)]
    struct CandidateContent { parts: Option<Vec<CandidatePart>> }
    #[derive(Deserialize)]
    struct Candidate { content: Option<CandidateContent> }
    #[derive(Deserialize)]
    struct Resp { candidates: Option<Vec<Candidate>> }
    let data: Resp = resp.json().await.map_err(|e| e.to_string())?;
    let out = data
        .candidates
        .and_then(|mut c| c.pop())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|mut p| p.into_iter().find_map(|p| p.text))
        .unwrap_or_default();
    Ok(out)
}

fn build_gemini_instructions(s: &AppSettings) -> String {
    let mut lines = vec![
        "あなたは入力テキストを自然な文に整形します。".to_string(),
        if s.naturalize_expressions { "不自然な口語のつなぎを自然に置換します。" } else { "" }.to_string(),
        if s.auto_punctuation { "句読点を適切に挿入します。" } else { "" }.to_string(),
        if s.unify_foreign_words { "外来語の表記を統一します（全角/半角の揺れも統一）。" } else { "" }.to_string(),
        if s.preserve_original_proper_nouns { "固有名詞は原文のまま保持します。" } else { "" }.to_string(),
        if s.no_summary_or_embellishment { "要約や脚色はしません。事実の追加・削除も行いません。" } else { "" }.to_string(),
        "出力は入力と同じ言語で返してください。".to_string(),
    ];
    for r in &s.custom_replace_rules { lines.push(format!("次の置換規則を適用: /{}/ -> {}", r.pattern, r.replace)); }
    lines.into_iter().filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n")
}

static EMAIL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}").unwrap());
static PHONE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?x)
    (?:\+?\d{1,4}[-\s]?)?                 # country code
    (?:\(?\d{2,4}\)?[-\s]?)?             # area code
    (?:\d{2,4}[-\s]?){2,3}                # local number parts
").unwrap());
static NUMBER_SEQ_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\d{6,}").unwrap());

fn apply_custom_rules(s: &AppSettings, input: &str) -> String {
    let mut out = input.to_string();
    for rule in &s.custom_replace_rules {
        let re = if let Some(f) = &rule.flags { Regex::new(&format!("(?{}){}", f, rule.pattern)) } else { Regex::new(&rule.pattern) };
        if let Ok(rex) = re { out = rex.replace_all(&out, rule.replace.as_str()).into_owned(); }
    }
    out
}

#[tauri::command]
fn mask_text(settings: AppSettings, input: String) -> Result<String, String> {
    let mut out = input;
    if settings.enable_dlp_scan {
        let has_sensitive = EMAIL_RE.is_match(&out) || PHONE_RE.is_match(&out) || NUMBER_SEQ_RE.is_match(&out);
        match settings.dlp_action.as_str() {
            "block" if has_sensitive => return Err("DLP block".into()),
            "warn" if has_sensitive => { /* could emit warn */ }
            _ => {}
        }
    }
    if settings.mask_email { out = EMAIL_RE.replace_all(&out, "＜メール＞").into_owned(); }
    if settings.mask_phone { out = PHONE_RE.replace_all(&out, "＜電話番号＞").into_owned(); }
    if settings.mask_numbers { out = NUMBER_SEQ_RE.replace_all(&out, "＜数列＞").into_owned(); }
    // TODO: address, names (requires locale resources)
    out = apply_custom_rules(&settings, &out);
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| { }))
        .setup(|app| {
            // Load settings from disk
            let cfg_dir = app.path().app_config_dir().map_err(|e| format!("path error: {e}"))?;
            let settings_path = cfg_dir.join("settings.json");
            let current = load_settings_from_disk(&settings_path).unwrap_or_default();
            let state = AppState {
                settings: Mutex::new(current),
                settings_path: Mutex::new(Some(settings_path)),
                recording_active: Mutex::new(false),
            };
            app.manage(state);

            // Register global hotkey (Alt+Space) as toggle start/stop
            use tauri_plugin_global_shortcut::Shortcut;
            let handle = app.handle();
            let _ = app.global_shortcut().register(Shortcut::new("Alt+Space").unwrap(), move || {
                let s: State<AppState> = handle.state();
                let active = *s.recording_active.lock().unwrap();
                if !active {
                    let _ = handle.emit("ptt:stateChanged", "recording");
                    *s.recording_active.lock().unwrap() = true;
                } else {
                    let _ = handle.emit("ptt:stateChanged", "processing");
                    *s.recording_active.lock().unwrap() = false;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_update,
            ptt_register,
            ptt_start,
            ptt_stop,
            clipboard_set,
            clipboard_clear,
            input_paste,
            stt_transcribe_once,
            nlp_gemini_format,
            mask_text,
            keys_get,
            keys_set,
            keys_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
