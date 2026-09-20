type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer rounded-[var(--radius-md)] ${className}`}
      aria-hidden="true"
    />
  );
}
