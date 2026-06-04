import { runStageADoc } from "./stage-a-doc";
import { runStageBDoc } from "./stage-b-doc";

/**
 * Run the full narrative pipeline (Stage A + Stage B) on a single document.
 * Returns the structured result + raw error if any stage failed.
 * Used in the DriveDocSummary upsert loop.
 */
export async function processDriveDocNarrative(
  fileName: string,
  rawContent: string
): Promise<{
  category: string | null;
  language: string | null;
  hasStructuredData: boolean;
  wordCount: number;
  summary: string | null;
  keyInsights: string[];
  processingError: string | null;
}> {
  const wordCount = rawContent.split(/\s+/).filter(Boolean).length;

  if (rawContent.length < 50) {
    return {
      category: null,
      language: null,
      hasStructuredData: false,
      wordCount,
      summary: null,
      keyInsights: [],
      processingError: `Content too short (${rawContent.length} chars) — narrative pipeline skipped`,
    };
  }

  try {
    const stageA = await runStageADoc(rawContent, fileName);
    const stageB = await runStageBDoc(rawContent, fileName, stageA);
    return {
      category: stageA.category,
      language: stageA.language,
      hasStructuredData: stageA.hasStructuredData,
      wordCount,
      summary: stageB.summary,
      keyInsights: stageB.keyInsights,
      processingError: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[DRIVE_NARRATIVE] ${fileName}: ${msg}`);
    return {
      category: null,
      language: null,
      hasStructuredData: false,
      wordCount,
      summary: null,
      keyInsights: [],
      processingError: msg.slice(0, 500),
    };
  }
}
