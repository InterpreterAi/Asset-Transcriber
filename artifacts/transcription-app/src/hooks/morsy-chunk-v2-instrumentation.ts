/**
 * Chunk V2 minimal telemetry — production-safe request ids only.
 */

let chunkV2RequestSeq = 0;

export function nextChunkV2RequestId(): string {
  chunkV2RequestSeq += 1;
  return `chunk_v2_${chunkV2RequestSeq}`;
}
