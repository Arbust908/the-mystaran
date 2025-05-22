// server/utils/scraper.ts

import { JSDOM } from 'jsdom';
import { parse, format } from 'date-fns';
import type { RawComment, RawArticle } from './types';

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

export async function scrapeArticles(url: string): Promise<{ article: RawArticle; comments: RawComment[] }> {
  const html = await $fetch<string>(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // 1) Main article block
  const entry = document.querySelector('#yui-main .first .item.entry');
  if (!entry) throw new Error('Article container not found');

  // 2) IDs
  const oldIdAttr = entry.id.match(/post-(\d+)/);
  const old_id = oldIdAttr ? parseInt(oldIdAttr[1], 10) : NaN;

  // 3) Title & link
  const titleEl = entry.querySelector('.itemhead h3 a') as HTMLAnchorElement;
  const title = titleEl?.textContent?.trim() || '';
  const link = titleEl?.href || '';

  // 4) Creation date
  const dateEl = entry.querySelector('.itemhead .chronodata');
  const created_at_raw = dateEl?.textContent?.trim() || '';
  let created_at = '';
  
  try {
    const created_at_date = parse(created_at_raw, 'MMMM do, yyyy', new Date());
    if (created_at_date && !isNaN(created_at_date.getTime())) {
      created_at = format(created_at_date, 'yyyy-MM-dd');
    }
  } catch {
    console.error('Failed to parse date:', created_at_raw);
    created_at = new Date().toISOString().split('T')[0]; // Fallback to current date
  }

  // 5) Content & images
  const storyEl = entry.querySelector('.storycontent');
  // content should remove the .yarpp-template-thumbnails element
  const relatedEls = document.querySelectorAll('.yarpp-thumbnail');
  const relatedBlock = storyEl?.querySelector('.yarpp-template-thumbnails');
  relatedBlock?.remove();

  const content = storyEl?.innerHTML.trim() ?? '';

  const images = Array.from(storyEl?.querySelectorAll('img') ?? [])
    .map(img => (img as HTMLImageElement).src);

  // 6) Categories & tags
  const metaEl = entry.querySelector('small.metadata')!;
  const categories = Array.from(metaEl.querySelectorAll('.category a'))
    .map(a => a.textContent!.trim());
  const tags = Array.from(metaEl.querySelectorAll('.tags a'))
    .map(a => a.textContent!.trim());

  // 7) Comments
  const commentEls = document.querySelectorAll('.commentlist li');
  const comments: RawComment[] = Array.from(commentEls).map((li: Element) => {
    const authorEl = li.querySelector('cite');
    const author = authorEl?.textContent?.trim() || '';
    const old_id = Number(li.id.replace('comment-', ''));

    // collect all <p> inside this <li> as the comment body
    const paras = Array.from(li.querySelectorAll('p'))
      .map((p: Element) => p.textContent?.trim() || '')
      .filter(t => t.length > 0);
    const content = paras;

    // find the date link inside the final <small><a>
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

  // 8) Related articles (YARPP thumbnails)
  const related: number[] = Array.from(relatedEls).map(a => {
    // parse old ID from URL, then assign a new UUID
    const href = (a as HTMLAnchorElement).href || '';
    const match = href.match(/wordpress\/(\d+)\//);
    const relatedId = match ? Number(match[1]) : 0;

    return relatedId;
  });

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
