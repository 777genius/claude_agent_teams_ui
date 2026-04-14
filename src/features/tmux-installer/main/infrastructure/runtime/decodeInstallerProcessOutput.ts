const UTF8_DECODER = new TextDecoder('utf-8');
const UTF16LE_DECODER = new TextDecoder('utf-16le');
const IBM866_DECODER = new TextDecoder('ibm866');
const WINDOWS_1251_DECODER = new TextDecoder('windows-1251');

export function decodeInstallerProcessOutput(
  output: string | Buffer,
  platform: NodeJS.Platform = process.platform
): string {
  if (typeof output === 'string') {
    return stripNulls(output);
  }
  if (output.length === 0) {
    return '';
  }

  if (hasUtf16LeBom(output) || looksLikeUtf16Le(output)) {
    return stripNulls(UTF16LE_DECODER.decode(output));
  }

  const utf8 = stripNulls(UTF8_DECODER.decode(output));
  if (platform !== 'win32') {
    return utf8;
  }

  const candidates = [
    utf8,
    stripNulls(IBM866_DECODER.decode(output)),
    stripNulls(WINDOWS_1251_DECODER.decode(output)),
  ];

  return candidates.slice(1).reduce(
    (best, candidate) => (scoreDecodedText(candidate) > scoreDecodedText(best) ? candidate : best),
    candidates[0] ?? utf8
  );
}

function stripNulls(value: string): string {
  return value.replace(/\0/g, '');
}

function hasUtf16LeBom(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 512);
  if (sampleSize < 2) {
    return false;
  }

  let pairs = 0;
  let nullsAtOddIndex = 0;
  for (let i = 0; i + 1 < sampleSize; i += 2) {
    pairs += 1;
    if (buffer[i + 1] === 0) {
      nullsAtOddIndex += 1;
    }
  }

  return pairs > 0 && nullsAtOddIndex / pairs >= 0.3;
}

function scoreDecodedText(value: string): number {
  let score = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === '\uFFFD') {
      score -= 25;
      continue;
    }
    if (char === '\n' || char === '\r' || char === '\t') {
      score += 0.5;
      continue;
    }
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      score += 1;
      continue;
    }
    if (
      (codePoint >= 0x0400 && codePoint <= 0x04ff) ||
      (codePoint >= 0x0500 && codePoint <= 0x052f)
    ) {
      score += 4;
      continue;
    }
    if (codePoint >= 0x2500 && codePoint <= 0x257f) {
      score += 0.4;
      continue;
    }
    if (codePoint < 0x20) {
      score -= 5;
      continue;
    }
    score += 0.1;
  }

  return score;
}
