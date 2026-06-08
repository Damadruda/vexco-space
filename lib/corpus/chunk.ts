// =============================================================================
// VEXCO-LAB — CHUNKING
// ~512 tokens por chunk, ~50 de solape, respetando limites de oracion/parrafo.
// Aproximacion de tokens: 1 token ≈ 4 chars (suficiente para chunking).
// =============================================================================

const TARGET_TOKENS = 512;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

export interface Chunk {
  ordinal: number;
  content: string;
  tokenCount: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkText(raw: string): Chunk[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const targetChars = TARGET_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;

  // Segmentar por oraciones/parrafos para no cortar a mitad de frase
  const segments = text.split(/(?<=[.!?\n])\s+/).filter(Boolean);

  const chunks: Chunk[] = [];
  let buffer = "";
  let ordinal = 0;

  const flush = () => {
    const content = buffer.trim();
    if (content) {
      chunks.push({ ordinal: ordinal++, content, tokenCount: estimateTokens(content) });
    }
  };

  for (const seg of segments) {
    if (buffer.length + seg.length > targetChars && buffer.length > 0) {
      flush();
      // arrancar el nuevo chunk con el solape final del anterior
      const tail = buffer.slice(-overlapChars);
      buffer = tail + " " + seg;
    } else {
      buffer += (buffer ? " " : "") + seg;
    }
  }
  flush();

  // Un unico segmento gigante sin puntuacion: cortar duro
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += targetChars - overlapChars) {
      const content = text.slice(i, i + targetChars);
      chunks.push({ ordinal: ordinal++, content, tokenCount: estimateTokens(content) });
    }
  }

  return chunks;
}
