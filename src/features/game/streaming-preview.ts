export interface StreamingPreview {
  title: string;
  storyContext: string;
}

// The streaming buffer is a JSON object being written token by token, so it's
// not parseable until the end. To show a friendly live preview we pull out the
// `title` and `story_context` values with tolerant regexes that match even when
// the string value hasn't been closed yet (still streaming).
//
// For each field: match `"field"` + `:` + opening quote, then capture
// everything up to the next UNescaped closing quote, OR up to the end of the
// buffer if it hasn't arrived. Decorative only — never used to build the board.
function extractField(buffer: string, field: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"?`);
  const match = re.exec(buffer);
  return match?.[1] ?? '';
}

export function extractStreamingPreview(buffer: string): StreamingPreview {
  return {
    title: extractField(buffer, 'title'),
    storyContext: extractField(buffer, 'story_context'),
  };
}
