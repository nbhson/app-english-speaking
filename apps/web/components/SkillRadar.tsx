// Skill radar chart — pure SVG, 9 assessment axes (0-5), no chart dependency.
// Rendered inside AssessmentPanel next to the bars for an at-a-glance profile.

import React from 'react';
import { motion } from 'motion/react';
import type { SessionAssessment } from '../types';

const SKILL_LABELS = [
  'Fluency',
  'Listening',
  'Reflex',
  'Sentence',
  'Vocab',
  'Intonation',
  'Linking',
  'Final Sound',
  'Stress',
] as const;

const MAX = 5;
const SIZE = 220;
const C = SIZE / 2; // center
const R = 78; // outer radius
const RINGS = [1, 2, 3, 4, 5];

function point(axis: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * axis) / SKILL_LABELS.length - Math.PI / 2;
  const r = (Math.max(0, Math.min(MAX, value)) / MAX) * R;
  return [C + Math.cos(angle) * r, C + Math.sin(angle) * r];
}

export const SkillRadar: React.FC<{ assessment: SessionAssessment; className?: string }> = ({
  assessment,
  className = '',
}) => {
  const values = [
    assessment.fluency,
    assessment.listening,
    assessment.reflexing,
    assessment.sentenceFlexibility,
    assessment.vocabularyFlexibility,
    assessment.intonation,
    assessment.linking,
    assessment.finalSound,
    assessment.stress,
  ].map((v) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(MAX, Number(v))) : 0);

  const polygon = values.map((v, i) => point(i, v)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      role="img"
      aria-label={`Skill radar: ${SKILL_LABELS.map((l, i) => `${SKILL_LABELS[i]} ${values[i]}/5`).join(', ')}`}
    >
      {/* grid rings */}
      {RINGS.map((r) => (
        <polygon
          key={r}
          points={SKILL_LABELS.map((_, i) => point(i, r)).map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={r === MAX ? 1 : 0.5}
          className="text-slate-200 dark:text-slate-700"
        />
      ))}
      {/* axes + labels */}
      {SKILL_LABELS.map((label, i) => {
        const [x, y] = point(i, MAX);
        const [lx, ly] = point(i, MAX + 0.9);
        return (
          <g key={label}>
            <line x1={C} y1={C} x2={x} y2={y} stroke="currentColor" strokeWidth={0.5} className="text-slate-200 dark:text-slate-700" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={8}
              fontWeight={700}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* value polygon */}
      <motion.polygon
        points={polygon}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ transformOrigin: 'center' }}
        className="fill-teal-500/25 stroke-teal-600 dark:stroke-teal-400"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* data points */}
      {values.map((v, i) => {
        const [x, y] = point(i, v);
        return <circle key={i} cx={x} cy={y} r={2.5} className="fill-teal-600 dark:fill-teal-400" />;
      })}
    </svg>
  );
};
