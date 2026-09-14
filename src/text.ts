const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "it", "its", "this", "that", "and", "or", "but",
  "to", "of", "in", "on", "for", "with", "i", "you", "we", "they", "he", "she",
  "was", "were", "be", "been", "so", "just", "like", "really", "very", "about",
  "im", "your", "my", "me", "not", "do", "did", "have", "has", "had", "what", "how",
  "far", "their", "from", "also", "think", "know", "get", "got", "one", "can",
]);

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** Words likely to carry topical signal: drops short/common words that are noise for both embedding and labeling. */
export function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}
