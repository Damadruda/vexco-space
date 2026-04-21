export const PROJECT_FILE_MAX_SIZE = 25 * 1024 * 1024;

export const PROJECT_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
] as const;

export const PROJECT_FILE_ALLOWED_EXTENSIONS = [
  '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.html', '.csv', '.json',
] as const;

export function isAllowedFileType(mimeType: string, fileName: string): boolean {
  if ((PROJECT_FILE_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return true;
  }
  const lower = fileName.toLowerCase();
  return PROJECT_FILE_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensionBadge(fileName: string, mimeType: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match) return match[1].toUpperCase();
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'text/markdown') return 'MD';
  return 'FILE';
}
