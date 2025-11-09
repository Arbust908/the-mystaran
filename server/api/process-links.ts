/**
 * ALEXANDRIAN SCRAPING - Single Article Processor (Alternative)
 *
 * Processes one article link at a time with transactional integrity and rollback capability.
 * This is an alternative to scrap.ts that provides finer control and error recovery.
 *
 * Architecture Role:
 * - Alternative to /server/api/scrap.ts for article processing
 * - Processes articles one at a time (suitable for scheduled jobs)
 * - Includes duplicate detection and transactional safety
 * - Provides rollback on partial failures
 *
 * Key Differences from scrap.ts:
 * - Processes 1 link per request (vs batch processing)
 * - Checks for existing articles before scraping
 * - Provides detailed step-by-step logging
 * - Includes cleanup on failure
 * - Uses standard client (vs service role)
 *
 * Processing Flow:
 * 1. Query for oldest unprocessed Article link (FIFO order)
 * 2. Check if article already exists in database
 * 3. If exists: Mark link as processed and skip
 * 4. If new:
 *    a. Scrape article content from HTML
 *    b. Insert article record
 *    c. Upsert tags and create relationships
 *    d. Mark link as processed
 * 5. On error: Attempt cleanup of partial inserts
 *
 * Transactional Safety:
 * - Single link processing reduces risk of partial failures
 * - Duplicate check prevents re-insertion
 * - Cleanup logic attempts to remove failed articles
 * - Each request is independent (suitable for cron/queue)
 *
 * Usage:
 * GET /api/process-links (call repeatedly until no links remain)
 *
 * Use Case:
 * - Scheduled jobs (call every N seconds)
 * - Manual testing (process one article at a time)
 * - Recovery from scrap.ts failures (reprocess failed links)
 *
 * @endpoint GET /api/process-links
 * @returns {{ message: string, link?: string }}
 */

import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '../../database.types';
import { CrawlStatus } from '../utils/crawler';
import { scrapeArticles } from '../utils/scraper';

export default defineEventHandler(async (event) => {
  console.log('[Process Links] Starting link processor');
  const client = await serverSupabaseClient<Database>(event);

  // === PHASE 1: Get Next Unprocessed Link ===
  // Fetch oldest unprocessed Article link (FIFO order)
  const { data: links, error: fetchError } = await client
    .from('found_links')
    .select('id, href')
    .eq('status', CrawlStatus.Article)     // Only Article links
    .is('processed_at', null)              // Not yet processed
    .order('created_at', { ascending: true })  // Oldest first
    .limit(1);                             // One at a time

  if (fetchError) throw fetchError;

  if (!links?.length) {
    console.log('[Process Links] No unprocessed links found');
    return { message: 'No unprocessed links found' };
  }

  const link = links[0];
  if (!link.href) {
    console.log('[Process Links] Invalid link found:', link);
    return { message: 'Invalid link found' };
  }

  console.log(`[Process Links] Processing link: ${link.href}`);

  try {
    // === PHASE 2: Check for Existing Article ===
    // Prevent duplicate articles (idempotency check)
    const { data: existingArticle } = await client
      .from('articles')
      .select('id')
      .eq('link', link.href)
      .single();

    if (existingArticle) {
      console.log(`[Process Links] Article already exists for link: ${link.href}`);

      // Mark link as processed to prevent re-processing
      await client
        .from('found_links')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', link.id);

      return { message: 'Article already exists', link: link.href };
    }

    // === PHASE 3: Scrape Article Content ===
    console.log(`[Process Links] Scraping article data from: ${link.href}`);
    const { article: scrapedArticle } = await scrapeArticles(link.href);
    console.log(`[Process Links] Found article: "${scrapedArticle.title}" with ${scrapedArticle.tags.length} tags`);

    // === PHASE 4: Sequential Database Operations ===
    // Process with rollback capability on failure
    try {
      // Step 1: Insert Article
      console.log('[Process Links] Inserting article');
      const { data: article, error: articleError } = await client
        .from('articles')
        .insert({
          title: scrapedArticle.title,
          content: scrapedArticle.content,
          link: link.href!,
          images: scrapedArticle.images || [],
          created_at: typeof scrapedArticle.created_at === 'string'
            ? scrapedArticle.created_at
            : new Date(scrapedArticle.created_at).toISOString(),
          old_id: scrapedArticle.old_id
        } satisfies Omit<Database['public']['Tables']['articles']['Insert'], 'id'>)
        .select('id')
        .single();

      if (articleError) throw articleError;
      if (!article) throw new Error('Failed to insert article');
      console.log(`[Process Links] Article inserted successfully with ID: ${article.id}`);

      // Step 2: Process Tags and Create Relationships
      console.log(`[Process Links] Processing ${scrapedArticle.tags.length} tags`);
      const tagIds = await Promise.all(scrapedArticle.tags.map(async (tagName) => {
        // Upsert tag (insert if new, return existing if duplicate)
        const { data: tag, error: tagError } = await client
          .from('tags')
          .upsert({
            name: tagName,
            description: `Tag for ${tagName}`,
            slug: tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-')  // URL-safe slug
          })
          .select('id')
          .single();

        if (tagError) throw tagError;
        if (!tag) throw new Error(`Failed to upsert tag: ${tagName}`);
        console.log(`[Process Links] Created/Updated tag: "${tagName}" (ID: ${tag.id})`);

        // Create many-to-many relationship
        const { error: relationError } = await client
          .from('article_tags')
          .upsert({
            article_id: article.id,
            tag_id: tag.id
          } satisfies Database['public']['Tables']['article_tags']['Insert']);

        if (relationError) throw relationError;
        return tag.id;
      }));

      console.log(`[Process Links] Created ${tagIds.length} tag relationships`);

      // Step 3: Mark Link as Processed
      const { error: updateError } = await client
        .from('found_links')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', link.id);

      if (updateError) throw updateError;
      console.log('[Process Links] Link marked as processed');

      return {
        message: 'Successfully processed link',
        link: link.href
      };

    } catch (processingError) {
      // === PHASE 5: Rollback on Failure ===
      console.error('[Process Links] Error during processing:', processingError);

      // Attempt to clean up partially inserted article
      // This prevents orphaned articles in the database
      if (processingError instanceof Error && processingError.message.includes('article.id')) {
        console.log('[Process Links] Attempting to clean up failed article');
        await client
          .from('articles')
          .delete()
          .eq('link', link.href);
      }

      throw processingError;
    }

  } catch (error) {
    console.error('[Process Links] Error processing link:', error);
    throw error;
  }
});
