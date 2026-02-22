interface StatsCardProps {
  label: string;
  value: string | number;
}

export function StatsCard({ label, value }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-game-border bg-game-surface px-6 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-200">
        {value}
      </p>
    </div>
  );
}
