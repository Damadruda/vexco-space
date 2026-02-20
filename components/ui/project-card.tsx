"use client";

import { Calendar, MoreHorizontal, Trash2, Edit, Eye, ArrowRight } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { PROJECT_TYPES, ProjectType } from "@/lib/project-types";

interface ProjectCardProps {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  projectType?: string;
  category?: string | null;
  tags?: string[];
  progress: number;
  priority: string;
  dueDate?: Date | string | null;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  isDragging?: boolean;
}

const priorityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta"
};

export function ProjectCard({
  id,
  title,
  description,
  projectType,
  category,
  tags = [],
  progress,
  priority,
  dueDate,
  onDelete,
  isDragging
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const formattedDate = dueDate
    ? new Date(dueDate).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short"
      })
    : null;

  const typeInfo = projectType && PROJECT_TYPES[projectType as ProjectType]
    ? PROJECT_TYPES[projectType as ProjectType]
    : null;

  return (
    <div
      className={`group relative border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 ${
        isDragging ? "rotate-2 scale-105 shadow-lg border-gray-400" : ""
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Link href={`/project-builder/${id}`} className="group/link flex items-center gap-1">
            <h3 className="font-medium text-gray-800 line-clamp-2 group-hover/link:text-gray-600">{title}</h3>
            <ArrowRight className="h-3 w-3 shrink-0 opacity-0 transition-all group-hover/link:opacity-100 group-hover/link:translate-x-0.5" />
          </Link>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {typeInfo && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.bgColor} ${typeInfo.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${typeInfo.dotColor}`} />
                {typeInfo.label}
              </span>
            )}
            {category && (
              <span className="text-xs text-gray-400">{category}</span>
            )}
          </div>
        </div>
        <div className="relative ml-2">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-gray-300 opacity-0 transition-opacity hover:text-gray-500 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-10 w-36 border border-gray-200 bg-white py-1 shadow-sm">
              <Link
                href={`/project-builder/${id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <Eye className="h-4 w-4" />
                Ver
              </Link>
              <Link
                href={`/project-builder/${id}/edit`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Link>
              {onDelete && (
                <button
                  onClick={() => onDelete(id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="mb-3 text-sm text-gray-500 line-clamp-2">{description}</p>
      )}

      {/* Progress */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-gray-400">Progreso</span>
          <span className="font-medium text-gray-600">{progress}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden bg-gray-100">
          <div
            className="h-full bg-gray-800 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tags */}
      {(tags?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="text-xs text-gray-300">+{tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-xs text-gray-400">
          {priorityLabels[priority] || "Media"}
        </span>
        {formattedDate && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="h-3 w-3" />
            {formattedDate}
          </span>
        )}
      </div>
    </div>
  );
}
