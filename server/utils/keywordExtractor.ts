import { stemmer } from 'stemmer'; // Ensure the stemming library is installed
import pos from 'pos'; // Parts of Speech tagging library

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'while', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'of', 'at', 'by', 'for', 'with', 'about', 'this',
  'that', 'these', 'those', 'it', 'its', 'as', 'into', 'from', 'up',
  'down', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'
]);

export const extractKeywords = (title: string, maxKeywords: number = 10): string[] => {
  if (!title) return [];

  // Tokenize and tag parts of speech
  const words = new pos.Lexer().lex(title.toLowerCase());
  const tagger = new pos.Tagger();
  const taggedWords = tagger.tag(words);

  const tokens = taggedWords
    .map(([word, tag]) => {
      if (STOPWORDS.has(word)) return null;
      // Prioritize nouns and proper nouns
      if (!tag.startsWith('NN')) return null;
      const stemmed = stemmer(word);
      return stemmed.length > 2 ? stemmed : null;
    })
    .filter((word): word is string => word !== null);

  const uniqueKeywords: string[] = [];
  const seen = new Set<string>();

  for (const word of tokens) {
    if (!seen.has(word)) {
      seen.add(word);
      uniqueKeywords.push(word);
      if (uniqueKeywords.length === maxKeywords) break;
    }
  }

  // Generate bigrams
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (!STOPWORDS.has(tokens[i + 1]) && !seen.has(bigram)) {
      bigrams.push(bigram);
      seen.add(bigram);
      uniqueKeywords.push(bigram);
      if (uniqueKeywords.length === maxKeywords) break;
    }
  }

  return uniqueKeywords;
};
