interface PaletteQuestion {
  q_num: number;
  status: 'current' | 'answered' | 'unattempted' | 'marked' | 'answered-marked' | 'reference';
}

export function QuestionPalette({
  questions,
  onJump,
}: {
  questions: PaletteQuestion[];
  onJump: (index: number) => void;
}) {
  const statusStyles: Record<PaletteQuestion['status'], string> = {
    current: 'bg-ink text-white dark:bg-paper dark:text-ink ring-2 ring-offset-2 ring-amber ring-offset-paper dark:ring-offset-ink',
    answered: 'bg-teal text-white',
    unattempted: 'bg-white dark:bg-graphite border border-slate-dim text-slate dark:text-slate-dim',
    marked: 'bg-amber text-white',
    'answered-marked': 'bg-amber text-white ring-2 ring-teal ring-inset',
    reference: 'bg-paper-2 dark:bg-graphite-2 border border-dashed border-slate-dim text-slate dark:text-slate-dim',
  };

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, idx) => (
          <button
            key={q.q_num}
            onClick={() => onJump(idx)}
            className={`w-9 h-9 rounded-bubble font-mono text-xs font-semibold flex items-center justify-center
                        transition-transform hover:scale-105 ${statusStyles[q.status]}`}
            aria-label={`Question ${q.q_num}, ${q.status}`}
          >
            {q.q_num}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-1.5 text-xs text-slate dark:text-slate-dim font-mono">
        <LegendRow swatch="bg-teal" label="Answered" />
        <LegendRow swatch="bg-white dark:bg-graphite border border-slate-dim" label="Not answered" />
        <LegendRow swatch="bg-amber" label="Marked for review" />
        <LegendRow swatch="bg-amber ring-2 ring-teal ring-inset" label="Answered & marked" />
        <LegendRow swatch="border border-dashed border-slate-dim" label="Reference (not scored)" />
      </div>
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3.5 h-3.5 rounded-bubble flex-shrink-0 ${swatch}`} />
      <span>{label}</span>
    </div>
  );
}
