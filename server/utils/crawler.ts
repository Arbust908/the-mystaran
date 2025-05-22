// server/utils/crawler.ts
import { JSDOM } from 'jsdom';


export interface LinkRecord {
  id: string;
  href: string;
  visited: boolean;
  status: number;
}

export enum CrawlStatus {
  Pending = 0,
  Visited = 1,
  Error = 2,
  File = 4,
  Tag = 5,
  Category = 6,
  Article = 7,
}

export const fileExts = ['.jpg','.jpeg','.png','.gif','.svg','.pdf','.mp3','.mp4','.zip', '.psd'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HTMLAnchorElement = any

export function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = '';
    parsedUrl.search = '';

    return parsedUrl.toString();
  } catch {
    return url; // Return as-is if URL parsing fails
  }
}
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const baseDomain = new URL('https://thealexandrian.net/').origin;

export async function getLinksFromUrl(currentUrl: string, visited: Set<string>, delayMs = 1000): Promise<string[] | null> {
  if (!currentUrl || visited.has(currentUrl)) return [];
  await delay(delayMs);
  const foundLinks: string[] = [];

  const _externalLinks: string[] = [];
  const _visitedLinks: string[] = [];

  try {
    const html = await $fetch<string>(currentUrl);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const anchors: HTMLAnchorElement[] = Array.from(document.querySelectorAll('a[href]'));
    console.info(`Found ${anchors.length} raw links`);
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      const absoluteUrl = normalizeUrl(href);

      const alreadyFound = foundLinks.includes(absoluteUrl);
      if (alreadyFound) continue;

      const isInternal = absoluteUrl.startsWith(baseDomain);
      if (!isInternal) {
        // console.info(`Skipping external link ${absoluteUrl}`);
        _externalLinks.push(absoluteUrl);
        continue;
      }

      const isVisited = visited.has(absoluteUrl);
      if (isVisited) {
        // console.info(`Skipping already visited link ${absoluteUrl}`);
        _visitedLinks.push(absoluteUrl);
        continue;
      }

      foundLinks.push(absoluteUrl);
    }
  } catch (error) {
    console.error(`Failed to fetch ${currentUrl}:`, error);
    return null;
  }
  if (foundLinks.length !== 0) {
    console.info(`Add ${foundLinks.length}. Skip ${_externalLinks.length} extenral and ${_visitedLinks.length} visited`);
  }

  return foundLinks;
}

export async function getDuplicateLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
   const uniqueCount = new Set(links.map(rec => rec.href)).size;
  const dupeCount = links.length - uniqueCount;
  if (dupeCount === 0) {
    return [];
  }
  console.error(`Found duplicate links: ${dupeCount} dupe${dupeCount > 1 ? 's' : ''}`);

  // Build a map of href → occurrence count
  const freq = new Map<string, number>();
  for (const { href } of links) {
    freq.set(href, (freq.get(href) ?? 0) + 1);
  }

  // Identify which hrefs are duplicates
  const dupHrefs = new Set(
    Array.from(freq.entries())
      .filter(([, count]) => count > 1)
      .map(([href]) => href)
  );

  // Return every record whose href is in that dup set
  return links.filter(rec => dupHrefs.has(rec.href));
}

export async function getNormalizedDuplicateLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  const duplicatedNormalizedLinks = []
  for (const rec of links) {
      const currentUrl = rec.href;
      const _normalUrl = normalizeUrl(currentUrl);
      if (_normalUrl !== currentUrl) {
        duplicatedNormalizedLinks.push(rec);
      }
  }
  if (duplicatedNormalizedLinks.length === 0) {
    return [];
  }
  console.error(`Found ${duplicatedNormalizedLinks.length} duplicate normalized links`);
  return duplicatedNormalizedLinks;
}

export async function getFileLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  const fileLinks = []
  for (const rec of links) {
    const currentUrl = rec.href;
    const isFile = fileExts.some(ext => currentUrl.endsWith(ext));
    if (isFile) {
      fileLinks.push(rec);
    }
  }
  
  if (fileLinks.length === 0) {
    return [];
  }
  console.error(`Found ${fileLinks.length} file links`);
  return fileLinks;
}

export async function getAllArticleLinks(links: LinkRecord[]): Promise<LinkRecord[]> {}

export async function getAllTagsLinks(links: LinkRecord[]): Promise<LinkRecord[]> {}

export async function getAllCategoriesLinks(links: LinkRecord[]): Promise<LinkRecord[]> {}
