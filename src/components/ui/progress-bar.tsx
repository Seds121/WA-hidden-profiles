type ProgressBarProps = {
  value?: number;
  label?: string;
  indeterminate?: boolean;
};

export function ProgressBar({
  value = 0,
  label,
  indeterminate = false,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full" role="progressbar" aria-valuenow={indeterminate ? undefined : clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {label && (
        <p className="mb-2 text-xs font-medium text-foreground-muted">{label}</p>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        {indeterminate ? (
          <div className="relative h-full w-1/4 rounded-full bg-primary animate-[indeterminate_1.2s_ease-in-out_infinite]" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  );
}
