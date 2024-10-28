import DOMPurify from 'dompurify';

export const useSanitizer = () => {
  const sanitize = (html: string) => {
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['a', 'p', 'strong', 'em', 'ul', 'li', 'br'],
      ALLOWED_ATTR: ['href', 'target', 'rel']
    });
    return clean.replace(/<a /g, '<a rel="noopener noreferrer" ');
  };
  return { sanitize };
};
