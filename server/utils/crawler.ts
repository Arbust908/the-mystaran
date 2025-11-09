/**
 * ALEXANDRIAN SCRAPING - Crawler Utilities
 *
 * This module provides core crawling functionality for discovering and managing links
 * from The Alexandrian blog (https://thealexandrian.net/). It handles URL normalization,
 * link discovery, duplicate detection, and status tracking.
 *
 * Architecture Role:
 * - Foundation layer for the scraping pipeline
 * - Provides link discovery and classification utilities
 * - Used by /server/api/crawl.ts for systematic site traversal
 * - Manages link state tracking through CrawlStatus enum
 *
 * Key Exports:
 * - getLinksFromUrl(): Extracts internal links from a URL
 * - normalizeUrl(): Standardizes URLs by removing fragments and query params
 * - getDuplicateLinks(): Identifies duplicate entries
 * - getFileLinks(): Filters file resources (images, PDFs, etc.)
 * - CrawlStatus enum: Tracks link processing states
 * - LinkRecord interface: Database schema representation
 *
 * @module server/utils/crawler
 */

// server/utils/crawler.ts
import { JSDOM } from 'jsdom';

/**
 * Represents a link record stored in the found_links database table.
 * Used to track discovered URLs and their processing status.
 *
 * @interface LinkRecord
 */
export interface LinkRecord {
  /** Unique identifier (UUID) */
  id: string;
  /** The full URL of the discovered link */
  href: string;
  /** Legacy field - whether the link has been visited */
  visited: boolean;
  /** Current processing status (see CrawlStatus enum) */
  status: number;
}

/**
 * Status codes for tracking link processing state in the crawling pipeline.
 * Links progress through these states as they are discovered and processed.
 *
 * @enum {number}
 */
export enum CrawlStatus {
  /** Discovered but not yet crawled */
  Pending = 0,
  /** Successfully crawled and links extracted */
  Visited = 1,
  /** Failed to fetch or parse */
  Error = 2,
  /** Identified as a file resource (not HTML) */
  File = 4,
  /** Identified as a tag listing page */
  Tag = 5,
  /** Identified as a category listing page */
  Category = 6,
  /** Identified as an article page (ready for scraping) */
  Article = 7,
}

/**
 * File extensions to identify non-HTML resources.
 * Links ending with these extensions are marked with CrawlStatus.File.
 */
export const fileExts = ['.jpg','.jpeg','.png','.gif','.svg','.pdf','.mp3','.mp4','.zip', '.psd'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HTMLAnchorElement = any

/**
 * Normalizes a URL by removing hash fragments and query parameters.
 * This ensures consistent URL representation and prevents duplicate entries.
 *
 * Example:
 * - Input:  'https://thealexandrian.net/page?foo=bar#section'
 * - Output: 'https://thealexandrian.net/page'
 *
 * @param {string} url - The URL to normalize
 * @returns {string} Normalized URL or original if parsing fails
 */
export function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove hash fragments (e.g., #section-1)
    parsedUrl.hash = '';
    // Remove query parameters (e.g., ?page=2)
    parsedUrl.search = '';

    return parsedUrl.toString();
  } catch {
    return url; // Return as-is if URL parsing fails
  }
}
/**
 * Utility function to introduce delays between requests.
 * Helps prevent rate limiting and reduces server load.
 *
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>} Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Base domain for The Alexandrian blog.
 * Used to filter internal vs external links during crawling.
 */
const baseDomain = new URL('https://thealexandrian.net/').origin;

/**
 * ALEXANDRIAN SCRAPING - Core Link Discovery Function
 *
 * Fetches a URL and extracts all internal links from the page.
 * This is the primary mechanism for discovering new pages to crawl.
 *
 * Process:
 * 1. Adds a delay to prevent rate limiting
 * 2. Fetches the HTML content of the URL
 * 3. Parses the HTML using JSDOM
 * 4. Extracts all anchor tags with href attributes
 * 5. Filters links to only include:
 *    - Internal links (same domain)
 *    - Not already visited
 *    - Not already in the found list
 * 6. Normalizes URLs to prevent duplicates
 *
 * Link Filtering Logic:
 * - External links (different domain): Skipped
 * - Already visited links: Skipped
 * - Duplicate links in current batch: Skipped
 *
 * @param {string} currentUrl - The URL to fetch and extract links from
 * @param {Set<string>} visited - Set of already visited URLs to avoid re-crawling
 * @param {number} delayMs - Milliseconds to wait before fetching (default: 1000)
 * @returns {Promise<string[] | null>} Array of discovered internal links, or null if fetch failed
 *
 * @example
 * const visited = new Set(['https://thealexandrian.net/about']);
 * const newLinks = await getLinksFromUrl('https://thealexandrian.net/', visited);
 * // Returns: ['https://thealexandrian.net/blog', 'https://thealexandrian.net/contact', ...]
 */
export async function getLinksFromUrl(currentUrl: string, visited: Set<string>, delayMs = 1000): Promise<string[] | null> {
  // Early return if URL is invalid or already visited
  if (!currentUrl || visited.has(currentUrl)) return [];

  // Rate limiting: wait before making request
  await delay(delayMs);

  const foundLinks: string[] = [];
  const _externalLinks: string[] = [];  // For logging purposes
  const _visitedLinks: string[] = [];   // For logging purposes

  try {
    // Fetch HTML content from the URL
    const html = await $fetch<string>(currentUrl);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract all anchor elements with href attributes
    const anchors: HTMLAnchorElement[] = Array.from(document.querySelectorAll('a[href]'));
    console.info(`Found ${anchors.length} raw links`);

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      // Normalize URL to ensure consistency
      const absoluteUrl = normalizeUrl(href);

      // Skip if already found in this batch
      const alreadyFound = foundLinks.includes(absoluteUrl);
      if (alreadyFound) continue;

      // Check if link is internal (same domain as The Alexandrian)
      const isInternal = absoluteUrl.startsWith(baseDomain);
      if (!isInternal) {
        _externalLinks.push(absoluteUrl);
        continue;
      }

      // Skip if already visited in previous crawls
      const isVisited = visited.has(absoluteUrl);
      if (isVisited) {
        _visitedLinks.push(absoluteUrl);
        continue;
      }

      // Add to list of new links discovered
      foundLinks.push(absoluteUrl);
    }
  } catch (error) {
    console.error(`Failed to fetch ${currentUrl}:`, error);
    return null;  // Return null to indicate fetch failure
  }

  // Log summary of link discovery
  if (foundLinks.length !== 0) {
    console.info(`Add ${foundLinks.length}. Skip ${_externalLinks.length} external and ${_visitedLinks.length} visited`);
  }

  return foundLinks;
}

/**
 * ALEXANDRIAN SCRAPING - Duplicate Link Detection
 *
 * Identifies duplicate link records in the database based on exact href matches.
 * This helps clean up the found_links table and prevent redundant crawling.
 *
 * Algorithm:
 * 1. Counts occurrences of each unique href
 * 2. Identifies hrefs that appear more than once
 * 3. Returns all records with duplicate hrefs
 *
 * Note: This finds exact duplicates. Use getNormalizedDuplicateLinks() for
 * URLs that differ only by query params or hash fragments.
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of all records with duplicate hrefs
 *
 * @example
 * const dupes = await getDuplicateLinks(allLinks);
 * // Returns all records where href appears multiple times
 */
export async function getDuplicateLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  const uniqueCount = new Set(links.map(rec => rec.href)).size;
  const dupeCount = links.length - uniqueCount;

  if (dupeCount === 0) {
    return [];
  }
  console.error(`Found duplicate links: ${dupeCount} dupe${dupeCount > 1 ? 's' : ''}`);

  // Build a frequency map: href → occurrence count
  const freq = new Map<string, number>();
  for (const { href } of links) {
    freq.set(href, (freq.get(href) ?? 0) + 1);
  }

  // Identify which hrefs are duplicates (appear more than once)
  const dupHrefs = new Set(
    Array.from(freq.entries())
      .filter(([, count]) => count > 1)
      .map(([href]) => href)
  );

  // Return every record whose href is in the duplicate set
  return links.filter(rec => dupHrefs.has(rec.href));
}

/**
 * ALEXANDRIAN SCRAPING - Normalized Duplicate Detection
 *
 * Identifies links that could be normalized to a simpler form.
 * These are links that contain query parameters or hash fragments
 * that should be removed for consistency.
 *
 * Example duplicates found:
 * - https://thealexandrian.net/page?foo=bar
 * - https://thealexandrian.net/page#section
 * Both normalize to: https://thealexandrian.net/page
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of records that would change when normalized
 */
export async function getNormalizedDuplicateLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  const duplicatedNormalizedLinks = []

  for (const rec of links) {
    const currentUrl = rec.href;
    const _normalUrl = normalizeUrl(currentUrl);

    // If normalization changes the URL, it's a duplicate
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

/**
 * ALEXANDRIAN SCRAPING - File Link Detection
 *
 * Identifies links that point to file resources rather than HTML pages.
 * These links should be marked with CrawlStatus.File and not crawled
 * for additional links.
 *
 * File types detected:
 * - Images: .jpg, .jpeg, .png, .gif, .svg
 * - Documents: .pdf, .psd
 * - Media: .mp3, .mp4
 * - Archives: .zip
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of links pointing to file resources
 */
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

/**
 * ALEXANDRIAN SCRAPING - Article Link Classification (Placeholder)
 *
 * Future function to identify links that are article pages.
 * Articles typically have URLs like:
 * https://thealexandrian.net/wordpress/{post-id}/{slug}
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of article links
 */
export async function getAllArticleLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  // TODO: Implement article link detection
  return [];
}

/**
 * ALEXANDRIAN SCRAPING - Tag Link Classification (Placeholder)
 *
 * Future function to identify links that are tag listing pages.
 * Tag pages have URLs like:
 * https://thealexandrian.net/tag/{tag-name}
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of tag page links
 */
export async function getAllTagsLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  // TODO: Implement tag link detection
  return [];
}

/**
 * ALEXANDRIAN SCRAPING - Category Link Classification (Placeholder)
 *
 * Future function to identify links that are category listing pages.
 * Category pages have URLs like:
 * https://thealexandrian.net/category/{category-name}
 *
 * @param {LinkRecord[]} links - Array of link records to check
 * @returns {Promise<LinkRecord[]>} Array of category page links
 */
export async function getAllCategoriesLinks(links: LinkRecord[]): Promise<LinkRecord[]> {
  // TODO: Implement category link detection
  return [];
}

export async function exportLinksToJson(links: LinkRecord[], filePath: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const jsonContent = JSON.stringify(links, null, 2);
  await fs.writeFile(filePath, jsonContent, 'utf-8');

  console.info(`Exported ${links.length} links to ${filePath}`);
}
