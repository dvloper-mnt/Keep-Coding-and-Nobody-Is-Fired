import { describe, expect, it } from 'vitest';
import { extractStreamingPreview } from './streaming-preview';

describe('extractStreamingPreview', () => {
  it('returns empty fields for empty or fence-only input', () => {
    expect(extractStreamingPreview('')).toEqual({ title: '', storyContext: '' });
    expect(extractStreamingPreview('```json')).toEqual({ title: '', storyContext: '' });
  });

  it('extracts the title once it appears, even before the value is closed', () => {
    const partial = '```json\n{\n  "id": "lvl_sql_x",\n  "title": "El catálogo fant';
    expect(extractStreamingPreview(partial).title).toBe('El catálogo fant');
  });

  it('extracts a fully written title', () => {
    const partial = '{ "id": "lvl_x", "title": "Rutas perdidas", "difficulty": "medium"';
    expect(extractStreamingPreview(partial).title).toBe('Rutas perdidas');
  });

  it('extracts story_context as it streams in', () => {
    const partial =
      '{ "title": "Bug", "difficulty": "medium", "story_context": "Una demo en vivo se rompe';
    const preview = extractStreamingPreview(partial);
    expect(preview.title).toBe('Bug');
    expect(preview.storyContext).toBe('Una demo en vivo se rompe');
  });

  it('ignores escaped quotes inside the value', () => {
    const partial = '{ "title": "El \\"bug\\" fantasma", "difficulty"';
    expect(extractStreamingPreview(partial).title).toBe('El \\"bug\\" fantasma');
  });

  it('does not crash on malformed/partial JSON', () => {
    expect(() => extractStreamingPreview('{ "tit')).not.toThrow();
    expect(extractStreamingPreview('{ "tit')).toEqual({ title: '', storyContext: '' });
  });
});
