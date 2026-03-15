"use client";

interface QLShimmerProps {
  lines?: number;
  className?: string;
}

export function QLShimmer({ lines = 3, className = "" }: QLShimmerProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`ql-shimmer h-4 ${i === 0 ? "w-3/4" : i === lines - 1 ? "w-1/2" : "w-full"}`}
        />
      ))}
    </div>
  );
}

interface QLInlineLoadingProps {
  text?: string;
}

export function QLInlineLoading({ text = "Cargando..." }: QLInlineLoadingProps) {
  return (
    <span className="ql-loading">
      {text}
      <span className="inline-block animate-bounce ml-0.5">.</span>
      <span className="inline-block animate-bounce ml-0.5 [animation-delay:0.1s]">.</span>
      <span className="inline-block animate-bounce ml-0.5 [animation-delay:0.2s]">.</span>
    </span>
  );
}

interface QLTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function QLTransition({ children, className = "" }: QLTransitionProps) {
  return (
    <div className={`ql-fade-in ${className}`}>
      {children}
    </div>
  );
}
