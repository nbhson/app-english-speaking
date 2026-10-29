// Shared design tokens (Tailwind class recipes) — single source for buttons,
// inputs, cards and toggles so spacing/typography/radii stay consistent
// across Settings, Library, modals and future panels.

/** Standard text input/select/textarea style. */
export const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ' +
  'rounded-xl px-3 py-2 text-sm outline-none transition-all dark:text-white ' +
  'focus:ring-2 focus:ring-blue-500/60 focus:border-blue-400 dark:focus:border-blue-500 ' +
  'placeholder-slate-400 disabled:opacity-50';

/** Primary CTA (solid blue). */
export const btnPrimary =
  'flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none';

/** Secondary/neutral button (bordered). */
export const btnSecondary =
  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none';

/** Quiet text-level action (small, no border). */
export const btnGhost =
  'flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none';

/** Surface for panels/cards (Library rows, stat tiles, settings sections). */
export const cardCls =
  'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm';

/** Segmented toggle pill (engine selectors, tabs). */
export const toggleCls = (active: boolean): string =>
  `px-3 py-1.5 rounded-xl text-xs font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
    active
      ? 'bg-blue-600 text-white shadow'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
  }`;
