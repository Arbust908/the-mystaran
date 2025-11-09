/**
 * ALEXANDRIAN SCRAPING - HTML Parser & Content Extractor
 *
 * This module handles the extraction of article content and metadata from The Alexandrian blog.
 * It uses JSDOM to parse HTML and extract structured data from WordPress-generated pages.
 *
 * Architecture Role:
 * - Core content extraction layer
 * - Transforms HTML into structured RawArticle and RawComment objects
 * - Used by /server/api/scrap.ts and /server/api/process-links.ts
 * - Handles WordPress-specific HTML structure and metadata
 *
 * Key Exports:
 * - scrapeArticles(): Main article extraction function
 * - scrapeHome(): Homepage menu/link extraction (future use)
 *
 * HTML Structure Dependencies:
 * The Alexandrian uses a specific WordPress theme with identifiable selectors:
 * - Article container: #yui-main .first .item.entry
 * - Title: .itemhead h3 a
 * - Date: .itemhead .chronodata
 * - Content: .storycontent
 * - Categories/Tags: .metadata .category/.tags a
 * - Comments: .commentlist li
 * - Related articles: .yarpp-template-thumbnails (YARPP plugin)
 *
 * @module server/utils/scraper
 */

// server/utils/scraper.ts

import { JSDOM } from 'jsdom';
import { parse, format } from 'date-fns';
import type { RawComment, RawArticle } from './types';

/**
 * Scrapes homepage content including menu and featured links.
 * Currently used for exploration; not part of main scraping pipeline.
 *
 * @returns {Promise<Object>} Object with promote (menu) and links arrays
 */
export async function scrapeHome() {
  const html = await $fetch<string>('https://thealexandrian.net/');
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const promote = Array.from(document.querySelectorAll('#menu a')).map((el: Element) => {
    const link = (el as HTMLAnchorElement).getAttribute('href') || '';
    const img = (el.querySelector('img') as HTMLImageElement)?.getAttribute('src') || '';
    const text = el.textContent?.trim() || (el.querySelector('img') as HTMLImageElement)?.getAttribute('alt') || '';
    return { link, img, text };
  });

  const links = Array.from(document.querySelectorAll('#third a')).map((el: Element) => {
    const link = (el as HTMLAnchorElement).getAttribute('href') || '';
    const text = el.textContent?.trim() || '';
    const isInternal = link.includes('thealexandrian.net/');

    return { link, text, isInternal };
  });

  return {
    promote,
    links,
  };
}

/**
 * ALEXANDRIAN SCRAPING - Main Article Extraction Function
 *
 * Extracts complete article data from a single article page on The Alexandrian blog.
 * This is the core scraping function that transforms WordPress HTML into structured data.
 *
 * Extraction Process:
 * 1. Fetch HTML from the article URL
 * 2. Parse HTML using JSDOM
 * 3. Extract article container (#yui-main .first .item.entry)
 * 4. Extract metadata (ID, title, date)
 * 5. Extract content and remove related articles block
 * 6. Extract images from content
 * 7. Extract categories and tags
 * 8. Extract comments with authors and dates
 * 9. Extract related article IDs (from YARPP plugin)
 *
 * Date Parsing:
 * - Article dates: "MMMM do, yyyy" (e.g., "January 1st, 2020")
 * - Comment dates: "MMMM do, yyyy - h:mm a" (e.g., "January 1st, 2020 - 3:45 pm")
 * - Output format: YYYY-MM-DD for database storage
 *
 * WordPress Structure Notes:
 * - old_id is extracted from post-{id} attribute on entry element
 * - Categories/tags are stored as plain text arrays (not IDs)
 * - Related articles use YARPP plugin (.yarpp-template-thumbnails)
 * - Comments use WordPress default structure (.commentlist li)
 *
 * @param {string} url - Full URL to the article page
 * @returns {Promise<{article: RawArticle, comments: RawComment[]}>} Article data and comments
 * @throws {Error} If article container is not found in HTML
 *
 * @example
 * const { article, comments } = await scrapeArticles('https://thealexandrian.net/wordpress/123/post-title');
 * console.log(article.title);  // "Article Title"
 * console.log(comments.length);  // 15
 */
export async function scrapeArticles(url: string): Promise<{ article: RawArticle; comments: RawComment[] }> {
  // Fetch raw HTML from the article URL
  const html = await $fetch<string>(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // === 1) Locate Main Article Container ===
  // The Alexandrian uses a YUI-based layout with specific container structure
  const entry = document.querySelector('#yui-main .first .item.entry');
  if (!entry) throw new Error('Article container not found');

  // === 2) Extract WordPress Post ID ===
  // WordPress adds id="post-{id}" to the entry element
  const oldIdAttr = entry.id.match(/post-(\d+)/);
  const old_id = oldIdAttr ? parseInt(oldIdAttr[1], 10) : NaN;

  // === 3) Extract Title & Canonical Link ===
  const titleEl = entry.querySelector('.itemhead h3 a') as HTMLAnchorElement;
  const title = titleEl?.textContent?.trim() || '';
  const link = titleEl?.href || '';

  // === 4) Extract & Parse Creation Date ===
  // Date format: "January 1st, 2020"
  const dateEl = entry.querySelector('.itemhead .chronodata');
  const created_at_raw = dateEl?.textContent?.trim() || '';
  let created_at = '';

  try {
    // Parse date using date-fns
    const created_at_date = parse(created_at_raw, 'MMMM do, yyyy', new Date());
    if (created_at_date && !isNaN(created_at_date.getTime())) {
      // Convert to YYYY-MM-DD format for database
      created_at = format(created_at_date, 'yyyy-MM-dd');
    }
  } catch {
    console.error('Failed to parse date:', created_at_raw);
    // Fallback to current date if parsing fails
    created_at = new Date().toISOString().split('T')[0];
  }

  // === 5) Extract Content & Images ===
  const storyEl = entry.querySelector('.storycontent');

  // Remove related articles block (YARPP plugin) from content
  // This block is extracted separately below
  const relatedEls = document.querySelectorAll('.yarpp-thumbnail');
  const relatedBlock = storyEl?.querySelector('.yarpp-template-thumbnails');
  relatedBlock?.remove();

  // Get full HTML content (preserving formatting, images, etc.)
  const content = storyEl?.innerHTML.trim() ?? '';

  // Extract all image URLs from content
  const images = Array.from(storyEl?.querySelectorAll('img') ?? [])
    .map(img => (img as HTMLImageElement).src);

  // === 6) Extract Categories & Tags ===
  // WordPress metadata is stored in small.metadata element
  const metaEl = entry.querySelector('small.metadata')!;
  const categories = Array.from(metaEl.querySelectorAll('.category a'))
    .map(a => a.textContent!.trim());
  const tags = Array.from(metaEl.querySelectorAll('.tags a'))
    .map(a => a.textContent!.trim());

  // === 7) Extract Comments ===
  const commentEls = document.querySelectorAll('.commentlist li');
  const comments: RawComment[] = Array.from(commentEls).map((li: Element) => {
    // Extract comment author from <cite> tag
    const authorEl = li.querySelector('cite');
    const author = authorEl?.textContent?.trim() || '';

    // Extract WordPress comment ID from li id="comment-{id}"
    const old_id = Number(li.id.replace('comment-', ''));

    // Collect all paragraphs as comment content
    // Comments can span multiple <p> tags
    const paras = Array.from(li.querySelectorAll('p'))
      .map((p: Element) => p.textContent?.trim() || '')
      .filter(t => t.length > 0);
    const content = paras;

    // Extract and parse comment date
    // Format: "January 1st, 2020 - 3:45 pm"
    const dateLink = li.querySelector('div small a');
    const raw = dateLink?.textContent?.trim() || '';
    let comment_created_at = new Date().toISOString().split('T')[0]; // Default fallback

    try {
      const parsed = parse(raw, "MMMM do, yyyy - h:mm a", new Date());
      if (parsed && !isNaN(parsed.getTime())) {
        comment_created_at = format(parsed, 'yyyy-MM-dd');
      }
    } catch {
      console.error('Failed to parse comment date:', raw);
    }

    return {
      old_id,
      author,
      content,
      created_at: comment_created_at
    };
  });
  const commentIds = comments.map(c => c.old_id);

  // === 8) Extract Related Articles ===
  // YARPP (Yet Another Related Posts Plugin) generates thumbnail links
  // URLs contain WordPress post IDs: /wordpress/{id}/{slug}
  const related: number[] = Array.from(relatedEls).map(a => {
    const href = (a as HTMLAnchorElement).href || '';
    const match = href.match(/wordpress\/(\d+)\//);
    const relatedId = match ? Number(match[1]) : 0;
    return relatedId;
  });

  // === 9) Assemble Final Article Object ===
  const article: RawArticle = {
    old_id,
    title,
    link,
    images,
    created_at,
    content,
    categories,
    tags,
    comment_ids: commentIds,
    related_ids: related,
  };

  return { article, comments };
}
