export const MAX_POST_LENGTH = 20000;

export const normalizePostContent = (content: string): string =>
  content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
