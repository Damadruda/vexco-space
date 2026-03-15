"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

export default function ProjectBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;

  const subnav = [
    { label: "Overview", href: `/project-builder/${id}` },
    { label: "Agile", href: `/project-builder/${id}/agile` },
    { label: "War Room", href: `/project-builder/${id}/war-room` },
  ];

  // War Room has its own full-screen layout — skip sub-nav there
  const isWarRoom = pathname?.includes("/war-room");
  if (isWarRoom) {
    return <>{children}</>;
  }

  return (
    <div>
      <nav className="flex gap-0 border-b border-ql-sand/30 bg-white px-6">
        {subnav.map(({ label, href }) => {
          const isActive =
            label === "Overview"
              ? pathname === href
              : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-5 py-3 text-sm font-medium transition-all ${
                isActive
                  ? "text-ql-charcoal border-b-2 border-ql-accent -mb-px"
                  : "text-ql-muted hover:text-ql-slate"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
