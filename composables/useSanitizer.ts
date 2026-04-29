const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const decodeHtmlEntities = (value: string) => value.replace(
  /&(#\d+|#x[\da-f]+|[a-z]+);/gi,
  (entity, code: string) => {
    if (code[0] === '#') {
      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const offset = radix === 16 ? 2 : 1;
      const parsed = Number.parseInt(code.slice(offset), radix);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }

    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  },
);

const htmlToText = (html: string) => decodeHtmlEntities(
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*p(?:\s[^>]*)?>/gi, '')
    .replace(/<\s*\/li\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '- ')
    .replace(/<\s*\/?(ul|ol)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<\s*a\b[^>]*>([\s\S]*?)<\s*\/a\s*>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim(),
);

export const useSanitizer = () => {
  const sanitize = (html: string) => {
    return htmlToText(html);
  };

  return { sanitize };
};
