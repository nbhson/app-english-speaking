import React, { useEffect, useState } from 'react';
import { AIConfig, DEFAULT_CONFIG, saveConfig, speech } from '../utils/api';
import { X, Save, RotateCcw, Plug, Mic, Volume2, MessageSquare, Play, Loader2, User, SlidersHorizontal, FileText, Layers } from 'lucide-react';
import { englishVoices } from '../utils/browser';
import { getProfiles, saveProfiles, getActiveProfileId, type NamedProfile } from '../utils/storage';
import { uid } from '../utils/storage';

const MODEL_SUGGESTIONS = [
  'gemini/gemini-3-flash-preview',
  'gemini/gemini-2.5-flash',
  'gemini/gemini-2.5-flash-lite',
  'auto/best-chat',
  'auto/best-fast',
  'auto/best-reasoning',
  'auto/chat',
  'auto/fast',
  'auto/offline',
  'oc/deepseek-v4-flash-free',
  'vertex/gemini-3-flash-preview',
  'gemini/gemini-3.5-flash',
];

const TTS_MODEL_SUGGESTIONS = [
  'vertex/gemini-3.1-flash-tts-preview',
  'vertex/gemini-2.5-flash-preview-tts',
  'vertex/gemini-2.5-pro-preview-tts',
];

const TTS_VOICE_SUGGESTIONS = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
];

interface Props {
  initial: AIConfig;
  onClose: () => void;
  onSaved: (cfg: AIConfig) => void;
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</span>}
  </label>
);

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm ' +
  'focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white';

const toggleCls = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
    active
      ? 'bg-blue-600 text-white shadow'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
  }`;

export const SettingsModal: React.FC<Props> = ({ initial, onClose, onSaved }) => {
  const [cfg, setCfg] = useState<AIConfig>({ ...initial });
  const [testingVoice, setTestingVoice] = useState(false);
  const [testVoiceError, setTestVoiceError] = useState<string | null>(null);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [profiles, setProfiles] = useState<NamedProfile[]>(() => getProfiles());
  const [activeId, setActiveId] = useState(() => getActiveProfileId());
  const [newName, setNewName] = useState('');

  const set = <K extends keyof AIConfig>(key: K, value: AIConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    const load = () => setBrowserVoices(englishVoices().length ? englishVoices() : []);
    load();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = load;
      // Chrome needs a kick
      try { window.speechSynthesis.getVoices(); } catch { /* ignore */ }
    }
    return () => { if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const handleTestVoice = async () => {
    setTestingVoice(true);
    setTestVoiceError(null);
    try {
      if (cfg.ttsEngine === 'custom') {
        const blob = await speech(cfg, 'Hello! Today we will practice your English speaking skills. This is a voice preview.');
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('Hello! Today we will practice your English speaking skills.');
        u.lang = 'en-US';
        u.rate = cfg.ttsRate ?? 1;
        u.pitch = cfg.ttsPitch ?? 1;
        const v = browserVoices.find((x) => x.voiceURI === cfg.ttsVoiceURI || x.name === cfg.ttsVoiceURI);
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      setTestVoiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSave = () => {
    saveConfig(cfg);
    // persist into active profile as well
    const next = profiles.map((p) => (p.id === activeId ? { ...p, config: cfg } : p));
    const finalProfiles = next.length ? next : [{ id: activeId || 'default', name: 'Default', config: cfg }];
    setProfiles(finalProfiles);
    saveProfiles(finalProfiles, activeId || 'default');
    onSaved(cfg);
    onClose();
  };

  const handleReset = () => {
    const defaults = { ...DEFAULT_CONFIG };
    saveConfig(defaults);
    setCfg(defaults);
  };

  const switchProfile = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setActiveId(id);
    setCfg({ ...p.config });
  };

  const addProfile = () => {
    const name = newName.trim() || `Profile ${profiles.length + 1}`;
    const entry: NamedProfile = { id: uid(), name, config: { ...cfg } };
    const next = [...profiles, entry];
    setProfiles(next);
    saveProfiles(next, entry.id);
    setActiveId(entry.id);
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Plug size={16} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">AI Connection Settings</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 space-y-6">
          {/* Profiles */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <Layers size={14} className="text-blue-500" /> Profiles (multi-provider)
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => switchProfile(p.id)}
                  className={`${toggleCls(p.id === activeId)} !px-3`}
                  title={p.config.baseUrl}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New profile name (e.g. OpenAI, Local)…" />
              <button onClick={addProfile} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap">
                + Add
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Endpoint */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <MessageSquare size={14} className="text-blue-500" /> Chat Model (via Gateway)
            </h3>
            <div className="space-y-3">
              <Field label="Base URL" hint="OpenAI-compatible endpoint, e.g. https://api.openai.com/v1">
                <input className={inputCls} value={cfg.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="http://localhost:20128/v1" />
              </Field>
              <Field label="API Key" hint="Bearer token. Leave empty if your gateway doesn't require one.">
                <input className={inputCls} type="password" value={cfg.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-... (optional)" />
              </Field>
              <Field label="Model" hint="Any model exposed by the gateway, e.g. gemini/gemini-3-flash-preview">
                <input className={inputCls} list="model-suggestions" value={cfg.model} onChange={e => set('model', e.target.value)} placeholder="gemini/gemini-3-flash-preview" />
                <datalist id="model-suggestions">
                  {MODEL_SUGGESTIONS.map(m => (<option key={m} value={m} />))}
                </datalist>
              </Field>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Coach */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <User size={14} className="text-blue-500" /> Coach style
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase w-20">Level</span>
                {(['beginner', 'intermediate', 'advanced'] as const).map((d) => (
                  <button key={d} className={toggleCls(cfg.difficulty === d)} onClick={() => set('difficulty', d)}>{d}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase w-20">Persona</span>
                {(['encouraging', 'strict', 'professional'] as const).map((p) => (
                  <button key={p} className={toggleCls(cfg.persona === p)} onClick={() => set('persona', p)}>{p}</button>
                ))}
              </div>
              <Field label="Custom system prompt (optional)" hint="Override toàn bộ SYSTEM_INSTRUCTION mặc định. Để trống = dùng prompt chuẩn của app.">
                <textarea className={`${inputCls} min-h-[90px] font-mono !text-xs`} value={cfg.systemPromptOverride ?? ''} onChange={(e) => set('systemPromptOverride', e.target.value)} placeholder="Paste your own coach instructions…" />
              </Field>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* STT */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <Mic size={14} className="text-blue-500" /> Speech-to-Text
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider w-24">Engine</span>
                <button className={toggleCls(cfg.sttEngine === 'browser')} onClick={() => set('sttEngine', 'browser')}>Browser (Web Speech)</button>
                <button className={toggleCls(cfg.sttEngine === 'custom')} onClick={() => set('sttEngine', 'custom')}>Custom Provider</button>
              </div>
              {cfg.sttEngine === 'custom' && (
                <Field label="STT Model" hint="Requires provider credentials (e.g. deepgram/nova-3, assemblyai/best)">
                  <input className={inputCls} value={cfg.sttModel} onChange={e => set('sttModel', e.target.value)} />
                </Field>
              )}
              <p className="text-[11px] text-slate-400">⚠️ Safari iOS / Firefox không hỗ trợ Web Speech → app sẽ tự gợi ý dùng Custom Provider (Hold to Speak).</p>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* TTS */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <Volume2 size={14} className="text-blue-500" /> Text-to-Speech
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider w-24">Engine</span>
                <button className={toggleCls(cfg.ttsEngine === 'browser')} onClick={() => set('ttsEngine', 'browser')}>Browser</button>
                <button className={toggleCls(cfg.ttsEngine === 'custom')} onClick={() => set('ttsEngine', 'custom')}>Custom Provider</button>
              </div>
              {cfg.ttsEngine === 'browser' && (
                <>
                  <Field label="Browser voice (EN)" hint="Giọng đọc hệ thống. US/UK, nam/nữ tùy OS/browser.">
                    <select className={inputCls} value={cfg.ttsVoiceURI ?? ''} onChange={(e) => set('ttsVoiceURI', e.target.value)}>
                      <option value="">System default</option>
                      {browserVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>{v.name} — {v.lang}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`Speed: ${cfg.ttsRate ?? 1}x`}>
                      <input type="range" min={0.5} max={1.5} step={0.1} value={cfg.ttsRate ?? 1} onChange={(e) => set('ttsRate', Number(e.target.value))} className="w-full" />
                    </Field>
                    <Field label={`Pitch: ${cfg.ttsPitch ?? 1}`}>
                      <input type="range" min={0.5} max={1.5} step={0.1} value={cfg.ttsPitch ?? 1} onChange={(e) => set('ttsPitch', Number(e.target.value))} className="w-full" />
                    </Field>
                  </div>
                </>
              )}
              {cfg.ttsEngine === 'custom' && (
                <>
                  <Field label="TTS Model" hint="Vertex Gemini TTS models are pre-configured on your custom provider">
                    <input className={inputCls} list="tts-model-suggestions" value={cfg.ttsModel} onChange={e => set('ttsModel', e.target.value)} placeholder="vertex/gemini-2.5-flash-preview-tts" />
                    <datalist id="tts-model-suggestions">
                      {TTS_MODEL_SUGGESTIONS.map(m => (<option key={m} value={m} />))}
                    </datalist>
                  </Field>
                  <Field label="Voice" hint="Gemini prebuilt voices, e.g. Zephyr / Puck / Kore">
                    <input className={inputCls} list="tts-voice-suggestions" value={cfg.ttsVoice} onChange={e => set('ttsVoice', e.target.value)} placeholder="Zephyr" />
                    <datalist id="tts-voice-suggestions">
                      {TTS_VOICE_SUGGESTIONS.map(v => (<option key={v} value={v} />))}
                    </datalist>
                  </Field>
                </>
              )}
              <button onClick={handleTestVoice} disabled={testingVoice} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-all">
                {testingVoice ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {testingVoice ? 'Testing…' : 'Test voice'}
              </button>
              {testVoiceError && (<p className="text-[11px] text-red-500 dark:text-red-400 mt-1 break-words">{testVoiceError}</p>)}
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
              <SlidersHorizontal size={14} className="text-blue-500" /> Advanced
            </h3>
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><FileText size={12} className="mt-0.5 shrink-0" /> API key lưu plaintext trong localStorage — chỉ dùng gateway local hoặc page HTTPS, tránh XSS.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 pb-[env(safe-area-inset-bottom)] border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <RotateCcw size={13} /> Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Cancel</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow transition-all">
              <Save size={14} /> Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
