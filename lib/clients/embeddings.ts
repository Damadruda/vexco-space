// =============================================================================
// VEXCO-LAB — EMBEDDINGS CLIENT
// gemini-embedding-001 a 768 dims via el cliente GoogleGenAI existente.
// IMPORTANTE: a <3072 dims Gemini NO devuelve vectores normalizados → normalizamos
// nosotros (L2) antes de almacenar/consultar, requisito para que el coseno sea correcto.
// =============================================================================

import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 768;
const BATCH_SIZE = 32;

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

async function embedBatch(texts: string[], taskType: TaskType): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");
  const ai = new GoogleGenAI({ apiKey });

  // NOTE: si el shape del SDK instalado difiere (nombre de metodo/campos),
  // ajustar a los tipos reales de @google/genai. Contrato esperado:
  // ai.models.embedContent({ model, contents: string[], config: { taskType, outputDimensionality } })
  // -> { embeddings: { values: number[] }[] }
  const resp = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIM },
  });

  const embeddings = resp.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(`embedContent devolvio ${embeddings.length} vectores para ${texts.length} textos`);
  }
  return embeddings.map((e: { values?: number[] }) => {
    const values = e.values ?? [];
    if (values.length !== EMBEDDING_DIM) {
      throw new Error(`Vector de dimension ${values.length}, esperaba ${EMBEDDING_DIM}`);
    }
    return l2normalize(values);
  });
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedBatch(slice, "RETRIEVAL_DOCUMENT")));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedBatch([text], "RETRIEVAL_QUERY");
  return v;
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export { EMBEDDING_DIM };
