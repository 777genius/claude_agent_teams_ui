export function stripTrailingOneMillionSuffixes(model: string | undefined): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/(?:\[1m\])+$/, '') || undefined;
}
