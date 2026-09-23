// Kept in its own tiny module so usePerformanceTests (loaded on every page)
// can share the importer's name normalization without pulling the whole
// Plyomat importer into the main bundle.
export const normalizeName = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, '')   // drop punctuation; "KJ" vs "K.J." should not differ
  .replace(/\s+/g, ' ')
  .trim();
