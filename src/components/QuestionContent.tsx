import { assetUrl } from '../api/client';

export function QuestionImage({ imagePath, lazy = false }: { imagePath: string; lazy?: boolean }) {
  return (
    <div className="rounded-card overflow-hidden border border-mist dark:border-graphite-2 bg-white">
      <img src={assetUrl(imagePath)} alt="Question" loading={lazy ? 'lazy' : 'eager'} className="w-full h-auto block" />
    </div>
  );
}

export function AnswerControls({
  type,
  selected,
  onSelect,
  optionLetters = ['A', 'B', 'C', 'D'],
}: {
  type: 'MCQ' | 'MSQ' | 'NAT';
  selected: string | null;
  onSelect: (value: string) => void;
  optionLetters?: string[];
}) {
  if (type === 'NAT') {
    return (
      <div className="mt-5">
        <label className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono">
          Enter numeric answer
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={selected ?? ''}
          onChange={(e) => onSelect(e.target.value.replace(/,/g, '.').replace(/[^0-9.+-]/g, ''))}
          placeholder="e.g. 42.5"
          className="mt-1.5 w-48 rounded-card border border-mist dark:border-graphite-2 bg-white dark:bg-graphite
                     px-3 py-2 font-mono text-base focus:border-amber outline-none block"
        />
      </div>
    );
  }

  const letters = optionLetters;
  const selectedSet = new Set((selected || '').split(';').filter(Boolean));

  function toggle(letter: string) {
    if (type === 'MCQ') {
      onSelect(letter);
    } else {
      const next = new Set(selectedSet);
      if (next.has(letter)) next.delete(letter); else next.add(letter);
      onSelect(Array.from(next).sort().join(';'));
    }
  }

  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono mb-2">
        {type === 'MSQ' ? 'Select all that apply' : 'Select one option'}
      </p>
      <div className="flex gap-2 flex-wrap">
        {letters.map((letter) => {
          const isSel = selectedSet.has(letter);
          return (
            <button
              key={letter}
              type="button"
              onClick={() => toggle(letter)}
              className={`w-12 h-12 font-mono font-semibold text-lg border-2 transition-colors
                ${type === 'MSQ' ? 'rounded-[6px]' : 'rounded-full'}
                ${isSel ? 'bg-amber text-white border-amber' : 'border-slate-dim text-slate dark:text-slate-dim hover:border-amber'}`}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}
