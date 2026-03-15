"use client";

import { Expert } from "./experts-data";

interface ExpertAvatarProps {
  expert: Expert;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
  active?: boolean;
  hasResponse?: boolean;
}

const sizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

export function ExpertAvatar({
  expert,
  size = "md",
  showRing = false,
  active = false,
  hasResponse = false,
}: ExpertAvatarProps) {
  // State-based coloring — monochromatic Quiet Luxury
  const colorClass = active
    ? "bg-ql-charcoal text-white"
    : hasResponse
    ? "bg-ql-accent/10 text-ql-accent"
    : "bg-ql-cream text-ql-slate";

  const ringClass = showRing ? "ring-2 ring-offset-1 ring-ql-sand/40" : "";

  return (
    <div
      className={`
        flex shrink-0 items-center justify-center rounded-full font-medium
        ${sizes[size]}
        ${colorClass}
        ${ringClass}
        transition-all duration-200
      `}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {expert.initials}
    </div>
  );
}
