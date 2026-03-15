"use client";

import { Expert } from "./experts-data";

interface ExpertAvatarProps {
  expert: Expert;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
}

const sizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

export function ExpertAvatar({ expert, size = "md", showRing = false }: ExpertAvatarProps) {
  return (
    <div
      className={`
        flex shrink-0 items-center justify-center rounded-full font-medium text-white
        ${sizes[size]}
        ${expert.bgColor}
        ${showRing ? `ring-2 ring-offset-1 ${expert.ringColor}` : ""}
        transition-all duration-200
      `}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {expert.initials}
    </div>
  );
}
