
export enum AppMode {
  DAILY = 'daily',
  MEETING = 'meeting',
  PRESENTATION = 'presentation',
  CUSTOM = 'custom',
  TRANSLATE = 'translate'
}

export interface SessionAssessment {
  fluency: number;
  listening: number;
  reflexing: number;
  sentenceFlexibility: number;
  vocabularyFlexibility: number;
  intonation: number;
  linking: number;
  finalSound: number;
  stress: number;
  vocabularyPoints: number;
  confidenceLevel: number;
  insight: string; // AI-written personalized feedback (from [Insight] block)
}

export interface TranscriptionEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  suggestion?: string; // Natural phrasing suggestion for a user message
  translation?: string; // Full-sentence translation
  assessment?: Partial<SessionAssessment>; // Optional assessment update
}

export interface SessionState {
  isActive: boolean;
  mode: AppMode;
  startTime: number | null;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  alternative: string;
}

// --- Browser speech recognition (Web Speech API) globals ---

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
