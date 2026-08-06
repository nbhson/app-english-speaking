import React, { useState } from 'react';
import { AIConfig, DEFAULT_CONFIG, saveConfig, speech } from '../utils/api';
import { X, Save, RotateCcw, Plug, Mic, Volume2, MessageSquare, Play, Loader2 } from 'lucide-react';

// A few sensible model suggestions for the datalist (gateway catalog).
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

// Vertex Gemini TTS models exposed by the gateway (see OmniRoute audioRegistry).
const TTS_MODEL_SUGGESTIONS = [
  'vertex/gemini-3.1-flash-tts-preview',
  'vertex/gemini-2.5-flash-preview-tts',
  'vertex/gemini-2.5-pro-preview-tts',
];

// Gemini prebuilt voices (https://ai.google.dev/gemini-api/docs/speech-generation).
// Passed straight through to Vertex as prebuiltVoiceConfig.voiceName.
const TTS_VOICE_SUGGESTIONS = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
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

  const set = <K extends keyof AIConfig>(key: K, value: AIConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  // Play a short sample using the current TTS config so the user can hear the
  // voice before saving (and can confirm the gateway path works).
  const handleTestVoice = async () => {
    setTestingVoice(true);
    setTestVoiceError(null);
    try {
      const blob = await speech(cfg, 'Hello! Today we will practice your English speaking skills. This is a voice preview.');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setTestVoiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSave = () => {
    saveConfig(cfg);
    onSaved(cfg);
    onClose();
  };

  const handleReset = () => {
    const defaults = { ...DEFAULT_CONFIG };
    saveConfig(defaults);
    setCfg(defaults);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Endpoint */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              <MessageSquare size={14} className="text-blue-500" /> Chat Model (via Gateway)
            </h3>
            <div className="space-y-3">
              <Field label="Base URL" hint="OpenAI-compatible endpoint, e.g. https://api.openai.com/v1">
                <input
                  className={inputCls}
                  value={cfg.baseUrl}
                  onChange={e => set('baseUrl', e.target.value)}
                  placeholder="http://localhost:20128/v1"
                />
              </Field>
              <Field label="API Key" hint="Bearer token. Leave empty if your gateway doesn't require one.">
                <input
                  className={inputCls}
                  type="password"
                  value={cfg.apiKey}
                  onChange={e => set('apiKey', e.target.value)}
                  placeholder="sk-... (optional)"
                />
              </Field>
              <Field label="Model" hint="Any model exposed by the gateway, e.g. gemini/gemini-3-flash-preview">
                <input
                  className={inputCls}
                  list="model-suggestions"
                  value={cfg.model}
                  onChange={e => set('model', e.target.value)}
                  placeholder="gemini/gemini-3-flash-preview"
                />
                <datalist id="model-suggestions">
                  {MODEL_SUGGESTIONS.map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
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
                <button className={toggleCls(cfg.sttEngine === 'browser')} onClick={() => set('sttEngine', 'browser')}>
                  Browser (Web Speech)
                </button>
                <button className={toggleCls(cfg.sttEngine === 'omniroute')} onClick={() => set('sttEngine', 'omniroute')}>
                  Gateway
                </button>
              </div>
              {cfg.sttEngine === 'omniroute' && (
                <Field label="STT Model" hint="Requires provider credentials on the gateway (e.g. deepgram/nova-3, assemblyai/best)">
                  <input className={inputCls} value={cfg.sttModel} onChange={e => set('sttModel', e.target.value)} />
                </Field>
              )}
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
                <button className={toggleCls(cfg.ttsEngine === 'browser')} onClick={() => set('ttsEngine', 'browser')}>
                  Browser
                </button>
                <button className={toggleCls(cfg.ttsEngine === 'omniroute')} onClick={() => set('ttsEngine', 'omniroute')}>
                  Gateway
                </button>
              </div>
              {cfg.ttsEngine === 'omniroute' && (
                <>
                  <Field label="TTS Model" hint="Vertex Gemini TTS models are pre-configured on your gateway">
                    <input
                      className={inputCls}
                      list="tts-model-suggestions"
                      value={cfg.ttsModel}
                      onChange={e => set('ttsModel', e.target.value)}
                      placeholder="vertex/gemini-2.5-flash-preview-tts"
                    />
                    <datalist id="tts-model-suggestions">
                      {TTS_MODEL_SUGGESTIONS.map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Voice" hint="Gemini prebuilt voices, e.g. Zephyr / Puck / Kore">
                    <input
                      className={inputCls}
                      list="tts-voice-suggestions"
                      value={cfg.ttsVoice}
                      onChange={e => set('ttsVoice', e.target.value)}
                      placeholder="Zephyr"
                    />
                    <datalist id="tts-voice-suggestions">
                      {TTS_VOICE_SUGGESTIONS.map(v => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </Field>
                  <button
                    onClick={handleTestVoice}
                    disabled={testingVoice}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-all"
                  >
                    {testingVoice ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    {testingVoice ? 'Testing…' : 'Test voice'}
                  </button>
                  {testVoiceError && (
                    <p className="text-[11px] text-red-500 dark:text-red-400 mt-1 break-words">{testVoiceError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <RotateCcw size={13} /> Reset defaults
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow transition-all"
            >
              <Save size={14} /> Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
