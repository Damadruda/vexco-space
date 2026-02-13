"use client";

import { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  number?: string;
  description?: string;
}

export function StatCard({ title, value, icon: Icon, number, description }: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 800;
    const steps = 20;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="group relative border border-gray-200 bg-white p-6 transition-all hover:border-gray-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            {number && (
              <span className="text-xs font-light text-gray-300">[{number}]</span>
            )}
            <Icon className="h-4 w-4 text-gray-400" />
          </div>
          <p className="font-serif text-4xl font-normal text-gray-900">{displayValue}</p>
          <p className="mt-2 text-sm font-medium text-gray-600">{title}</p>
          {description && (
            <p className="mt-1 text-xs text-gray-400">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}