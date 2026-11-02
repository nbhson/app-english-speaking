import React from 'react';
import {
  ArrowRightLeft,
  BookOpenText,
  GraduationCap,
  RotateCcw,
  SpellCheck,
  type LucideIcon,
} from 'lucide-react';
import { AppMode, type ToolId } from '../types';
import { MODE_CONFIGS } from '../modes';

interface SidebarItemProps {
  mode: AppMode;
  active: boolean;
  onClick: (mode: AppMode) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ mode, active, onClick }) => {
  const mc = MODE_CONFIGS[mode];
  return (
    <button
      onClick={() => onClick(mode)}
      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
      }`}
      aria-current={active ? 'page' : undefined}
      aria-label={`Select ${mc.title} mode`}
    >
      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${active ? 'bg-white' : mc.dot}`} aria-hidden />
      <span className="min-w-0">
        <span className="block font-bold text-xs lg:text-sm leading-tight">{mc.title}</span>
        <span className={`block text-[10px] leading-tight mt-0.5 truncate ${active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>{mc.tagline}</span>
      </span>
    </button>
  );
};

const PRACTICE_MODES: AppMode[] = [
  AppMode.DAILY,
  AppMode.MEETING,
  AppMode.PRESENTATION,
  AppMode.ROLEPLAY,
  AppMode.DEBATE,
  AppMode.STORY,
];

interface FeatureCardSection {
  key: string;
  title: string;
  tagline: string;
  /** present → click switches the practice mode */
  mode?: AppMode;
  /** present → click opens a tool modal instead */
  tool?: ToolId;
  icon: LucideIcon;
  /** tiny badge in the top-right corner, e.g. "tool" / "1-1" / "SRS" */
  badge: string;
  cardIdle: string;
  cardActive: string;
  iconIdle: string;
  taglineIdle: string;
  badgeIdle: string;
}

interface FeatureGroup {
  heading: string;
  items: FeatureCardSection[];
}

/** Categories that are not conversation practice — each card gets its own design. */
const FEATURE_GROUPS: FeatureGroup[] = [
  {
    heading: 'Tools',
    items: [
      {
        key: 'translate',
        title: MODE_CONFIGS[AppMode.TRANSLATE].title,
        tagline: MODE_CONFIGS[AppMode.TRANSLATE].tagline,
        mode: AppMode.TRANSLATE,
        icon: ArrowRightLeft,
        badge: 'tool',
        cardIdle: 'bg-gradient-to-r from-rose-50/80 to-amber-50/80 dark:from-rose-950/40 dark:to-amber-950/20 border-rose-200 dark:border-rose-900/50 hover:border-rose-300 dark:hover:border-rose-800 hover:shadow-sm hover:shadow-rose-500/10',
        cardActive: 'bg-gradient-to-r from-rose-500 to-orange-500 text-white border-transparent shadow-md shadow-rose-500/25',
        iconIdle: 'bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/15',
        taglineIdle: 'text-rose-500/70 dark:text-rose-400/60',
        badgeIdle: 'bg-rose-100 dark:bg-rose-900/40 text-rose-500 dark:text-rose-300',
      },
      {
        key: 'word-dive',
        title: 'Word Deep-Dive',
        tagline: 'Bóc 1 từ: IPA, collocations, lỗi hay mắc',
        tool: 'wordDive',
        icon: BookOpenText,
        badge: 'dict',
        cardIdle: 'bg-gradient-to-r from-emerald-50/80 to-lime-50/80 dark:from-emerald-950/40 dark:to-lime-950/20 border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-800 hover:shadow-sm hover:shadow-emerald-500/10',
        cardActive: '',
        iconIdle: 'bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/15',
        taglineIdle: 'text-emerald-600/70 dark:text-emerald-400/60',
        badgeIdle: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300',
      },
      {
        key: 'grammar-fix',
        title: 'Grammar Fix',
        tagline: 'Paste đoạn văn → sửa + giải thích từng lỗi',
        tool: 'grammarFix',
        icon: SpellCheck,
        badge: 'fix',
        cardIdle: 'bg-gradient-to-r from-sky-50/80 to-indigo-50/80 dark:from-sky-950/40 dark:to-indigo-950/20 border-sky-200 dark:border-sky-900/50 hover:border-sky-300 dark:hover:border-sky-800 hover:shadow-sm hover:shadow-sky-500/10',
        cardActive: '',
        iconIdle: 'bg-sky-500/10 text-sky-600 group-hover:bg-sky-500/15',
        taglineIdle: 'text-sky-600/70 dark:text-sky-400/60',
        badgeIdle: 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-200',
      },
    ],
  },
  {
    heading: 'Classes',
    items: [
      {
        key: 'custom',
        title: MODE_CONFIGS[AppMode.CUSTOM].title,
        tagline: MODE_CONFIGS[AppMode.CUSTOM].tagline,
        mode: AppMode.CUSTOM,
        icon: GraduationCap,
        badge: '1-1',
        cardIdle: 'bg-gradient-to-r from-amber-50/80 to-yellow-50/80 dark:from-amber-950/40 dark:to-yellow-950/20 border-amber-200 dark:border-amber-900/50 hover:border-amber-300 dark:hover:border-amber-800 hover:shadow-sm hover:shadow-amber-500/10',
        cardActive: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md shadow-amber-500/25',
        iconIdle: 'bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/15',
        taglineIdle: 'text-amber-600/70 dark:text-amber-400/60',
        badgeIdle: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300',
      },
      {
        key: 'review',
        title: MODE_CONFIGS[AppMode.REVIEW].title,
        tagline: MODE_CONFIGS[AppMode.REVIEW].tagline,
        mode: AppMode.REVIEW,
        icon: RotateCcw,
        badge: 'SRS',
        cardIdle: 'bg-gradient-to-r from-teal-50/80 to-cyan-50/80 dark:from-teal-950/40 dark:to-cyan-950/20 border-teal-200 dark:border-teal-900/50 hover:border-teal-300 dark:hover:border-teal-800 hover:shadow-sm hover:shadow-teal-500/10',
        cardActive: 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white border-transparent shadow-md shadow-teal-500/25',
        iconIdle: 'bg-teal-500/10 text-teal-600 group-hover:bg-teal-500/15',
        taglineIdle: 'text-teal-600/70 dark:text-teal-400/60',
        badgeIdle: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300',
      },
    ],
  },
];

interface FeatureCardItemProps {
  section: FeatureCardSection;
  active: boolean;
  onChangeMode: (mode: AppMode) => void;
  onOpenTool: (tool: ToolId) => void;
}

/** Translator / class / tool cards — richer design than the minimal practice-mode rows. */
const FeatureCardItem: React.FC<FeatureCardItemProps> = ({ section, active, onChangeMode, onOpenTool }) => {
  const Icon = section.icon;
  return (
    <button
      onClick={() => {
        if (section.mode) onChangeMode(section.mode);
        else if (section.tool) onOpenTool(section.tool);
      }}
      data-tour-id={`feature-${section.key}`}
      className={`group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left ${
        active ? section.cardActive : section.cardIdle
      }`}
      aria-current={active ? 'page' : undefined}
      aria-label={section.mode ? `Select ${section.title}` : `Open ${section.title}`}
    >
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors ${
          active ? 'bg-white/20 text-white' : section.iconIdle
        }`}
        aria-hidden
      >
        <Icon size={14} strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-xs lg:text-sm leading-tight">{section.title}</span>
        <span className={`block text-[10px] leading-tight mt-0.5 truncate ${active ? 'text-white/80' : section.taglineIdle}`}>{section.tagline}</span>
      </span>
      <span
        className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
          active ? 'bg-white/20 text-white' : section.badgeIdle
        }`}
      >
        {section.badge}
      </span>
    </button>
  );
};

interface SidebarProps {
  activeMode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  onOpenTool: (tool: ToolId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeMode, onChangeMode, onOpenTool }) => (
  <nav className="flex flex-col space-y-2 overflow-y-auto pr-2 shrink-0" aria-label="Practice modes, tools and classes">
    <div className="mb-2">
      <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">
        Practice Modes
      </h2>
      <div className="space-y-1.5">
        {PRACTICE_MODES.map((m) => (
          <SidebarItem key={m} mode={m} active={activeMode === m} onClick={onChangeMode} />
        ))}
      </div>
    </div>
    {FEATURE_GROUPS.map((group) => (
      <div key={group.heading} className="mb-4">
        <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">
          {group.heading}
        </h2>
        <div className="space-y-1.5">
          {group.items.map((section) => (
            <FeatureCardItem
              key={section.key}
              section={section}
              active={section.mode ? activeMode === section.mode : false}
              onChangeMode={onChangeMode}
              onOpenTool={onOpenTool}
            />
          ))}
        </div>
      </div>
    ))}
    <div className={`rounded-lg p-4 border ${MODE_CONFIGS[activeMode].accent}`}>
      <h3 className="font-bold text-sm mb-1">{MODE_CONFIGS[activeMode].coachRole} Tip</h3>
      <p className="text-xs leading-relaxed opacity-90">
        {MODE_CONFIGS[activeMode].tip}
      </p>
    </div>
  </nav>
);
