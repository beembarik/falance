export class RequestBodyLimitError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super("Request body exceeds the configured limit.");
    this.name = "RequestBodyLimitError";
    this.maxBytes = maxBytes;
  }
}

export async function readTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isSafeInteger(parsedLength) && parsedLength > maxBytes) {
      throw new RequestBodyLimitError(maxBytes);
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) throw new RequestBodyLimitError(maxBytes);
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}
