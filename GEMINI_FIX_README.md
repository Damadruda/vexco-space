# Gemini 404 Fix & Multimodal Folder Analysis

## NPM Update Command

To update the Google Generative AI package to the latest version:

```bash
# Using npm
npm install @google/generative-ai@latest

# Using yarn
yarn add @google/generative-ai@latest

# Using pnpm
pnpm add @google/generative-ai@latest
```

## Changes Made

### 1. Fixed Gemini Model Identifier (404 Error)

**Problem:** The model `"gemini-1.5-flash"` returns a 404 error on the v1beta API.

**Solution:** Implemented model fallback system with correct identifiers:
- Primary: `gemini-1.5-flash-latest` (stable alias)
- Fallback: `gemini-2.0-flash-exp` (experimental)
- Fallback: `gemini-pro-vision` (legacy)

### 2. Recursive Folder Scanning

- Scans entire Google Drive folder hierarchy (subcarpetas)
- Configurable max depth (default: 10 levels)
- Error-tolerant: continues if individual folders fail
- Handles pagination (up to 1000 files per folder)

### 3. Multimodal Processing

| File Type | Processing Method |
|-----------|-------------------|
| Images (JPEG, PNG, GIF, WebP) | Download → Base64 → Gemini `inlineData` |
| Google Docs | Export as text/plain |
| Google Sheets | Export as CSV |
| Text files, HTML, JSON | Direct download |
| PDFs | Export as text (Google Docs conversion) |

### 4. Error Tolerance

- Each file is processed in a try-catch block
- Failed files are logged but don't stop processing
- Error summary returned in response
- Batch processing to handle large folders

### 5. Vercel Pro Timeout

`vercel.json` configured with `maxDuration: 300` (5 minutes) for the endpoint.

### 6. Project Data Saved

The analysis is saved to the `Project` table with:
- `title`: Folder name
- `description`: Full AI analysis (Markdown formatted)
- `concept`: Extracted objectives/concept section
- `targetMarket`: Market trends section
- `metrics`: KPIs section
- `actionPlan`: Recommendations section
- `resources`: File processing statistics

## API Response Format

```json
{
  "success": true,
  "project": {
    "id": "...",
    "title": "Folder Name",
    "description": "## RESUMEN EJECUTIVO\n..."
  },
  "stats": {
    "totalFiles": 45,
    "processedFiles": 38,
    "images": 12,
    "documents": 26,
    "duration": "45.23s",
    "errors": ["file.zip: Unsupported type"]
  }
}
```

## Environment Variables Required

- `GEMINI_API_KEY`: Your Google Generative AI API key
- Database connection (via Prisma)
- NextAuth with Google OAuth configured
