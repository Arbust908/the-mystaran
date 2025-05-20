import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '../../database.types';
import { CrawlStatus } from '../utils/crawler';
import { scrapeArticles } from '../utils/scraper';

export default defineEventHandler(async (event) => {
  console.log('[Process Links] Starting link processor');
  const client = await serverSupabaseClient<Database>(event);

  // Get unprocessed links
  const { data: links, error: fetchError } = await client
    .from('found_links')
    .select('id, href')
    .eq('status', CrawlStatus.Article)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

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
    // Check if article already exists
    const { data: existingArticle } = await client
      .from('articles')
      .select('id')
      .eq('link', link.href)
      .single();

    if (existingArticle) {
      console.log(`[Process Links] Article already exists for link: ${link.href}`);
      // Mark as processed and skip
      await client
        .from('found_links')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', link.id);
      
      return { message: 'Article already exists', link: link.href };
    }

    // Scrape article data
    console.log(`[Process Links] Scraping article data from: ${link.href}`);
    const { article: scrapedArticle } = await scrapeArticles(link.href);
    console.log(`[Process Links] Found article: "${scrapedArticle.title}" with ${scrapedArticle.tags.length} tags`);

    // Sequential processing with rollback capability
    try {
      // 1. Insert article
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

      // 2. Process tags
      console.log(`[Process Links] Processing ${scrapedArticle.tags.length} tags`);
      const tagIds = await Promise.all(scrapedArticle.tags.map(async (tagName) => {
        // Upsert tag
        const { data: tag, error: tagError } = await client
          .from('tags')
          .upsert({ 
            name: tagName,
            description: `Tag for ${tagName}`,
            slug: tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          })
          .select('id')
          .single();

        if (tagError) throw tagError;
        if (!tag) throw new Error(`Failed to upsert tag: ${tagName}`);
        console.log(`[Process Links] Created/Updated tag: "${tagName}" (ID: ${tag.id})`);

        // Create relationship
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

      // 3. Mark link as processed
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
      console.error('[Process Links] Error during processing:', processingError);
      // If we fail after article creation, attempt to clean up
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
