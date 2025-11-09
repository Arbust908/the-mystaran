/**
 * ALEXANDRIAN SCRAPING - Batch Article Scraper
 *
 * Processes multiple unprocessed article links from the found_links table,
 * extracts full article content, and saves to the database with relationships.
 * This is the main article extraction endpoint that populates the articles table.
 *
 * Architecture Role:
 * - Third step in the scraping pipeline (after crawl.ts and link-process.ts)
 * - Batch processes all unprocessed Article links
 * - Extracts article content, metadata, comments, categories, and tags
 * - Creates database records with full relationship mappings
 *
 * Processing Flow:
 * 1. Query found_links for unprocessed Article links (status = 7, processed_at IS NULL)
 * 2. For each link:
 *    a. Call scrapeArticles() to extract HTML content
 *    b. Insert article record into articles table
 *    c. Upsert categories and create article_categories relationships
 *    d. Upsert tags and create article_tags relationships
 *    e. Insert comments with article_id reference
 *    f. Mark link as processed with timestamp
 * 3. Return processing results (success/error per link)
 *
 * Data Flow:
 * found_links (Article) → scrapeArticles() → RawArticle
 *   ├→ articles table
 *   ├→ categories table + article_categories junction
 *   ├→ tags table + article_tags junction
 *   └→ comments table
 *
 * Error Handling:
 * - Each link processed independently (one failure doesn't stop others)
 * - Errors logged to results array with link URL and error message
 * - Processed timestamp only set on successful completion
 *
 * Usage:
 * GET /api/scrap
 *
 * Note: This endpoint uses service role client for database writes.
 * Consider pagination for large batches.
 *
 * @endpoint GET /api/scrap
 * @returns {{ processed: number, results: Array<{url: string, status: 'success'|'error', error?: string}> }}
 */

import { serverSupabaseServiceRole } from '#supabase/server';
import { scrapeArticles } from "../utils/scraper"
import { CrawlStatus } from "../utils/crawler"

export default defineEventHandler(async (event) => {
  // === PHASE 1: Query Unprocessed Article Links ===
  // Get all Article links that haven't been scraped yet
  const { data: links } = await serverSupabaseServiceRole(event)
    .from('found_links')
    .select('*')
    .is('processed_at', null)           // Not yet processed
    .eq('status', CrawlStatus.Article)  // Status = 7 (Article)

  if (!links || links.length === 0) {
    return {
      processed: 0,
      results: []
    }
  }

  const results = []

  // === PHASE 2: Process Each Article Link ===
  for (const link of links) {
    try {
      // Validate link href exists
      if (!link.href) {
        throw new Error('Link href is missing')
      }

      // Extract article content and comments from HTML
      const { article, comments } = await scrapeArticles(link.href)

      // Prepare article data for insertion (exclude relationships)
      const articleToInsert = {
        old_id: article.old_id,
        title: article.title,
        link: article.link,
        images: article.images,
        created_at: article.created_at,
        content: article.content
      }

      // Insert article record
      const { data: savedArticle, error: saveError } = await supabase
        .from('articles')
        .insert(articleToInsert)
        .select()
        .single()

      if (!savedArticle || saveError) {
        throw new Error(saveError?.message || 'Failed to save article')
      }
      console.info(`Saved article ${savedArticle.id}`)

      // === Process Categories ===
      // Create category records and relationships
      for (const categoryName of article.categories) {
        // Upsert category (insert if new, return existing if duplicate)
        const { data: category, error: categoryError } = await supabase
          .from('categories')
          .upsert({
            name: categoryName,
            description: ''
          }, {
            onConflict: 'name'  // Unique constraint on name column
          })
          .select()
          .single()

        if (categoryError || !category) {
          throw new Error(`Failed to save category ${categoryName}: ${categoryError?.message}`)
        }

        // Create many-to-many relationship
        const { error: relationError } = await supabase
          .from('article_categories')
          .insert({
            article_id: savedArticle.id,
            category_id: category.id
          })

        if (relationError) {
          throw new Error(`Failed to link article to category: ${relationError.message}`)
        }
      }
      console.info(`Saved ${article.categories.length} categories`)

      // === Process Tags ===
      // Create tag records and relationships
      for (const tagName of article.tags) {
        // Upsert tag with generated slug
        const { data: tag, error: tagError } = await supabase
          .from('tags')
          .upsert({
            name: tagName,
            description: '',
            slug: tagName.toLowerCase().replace(/\s+/g, '-')  // Generate URL-friendly slug
          }, {
            onConflict: 'name'  // Unique constraint on name column
          })
          .select()
          .single()

        if (tagError || !tag) {
          throw new Error(`Failed to save tag ${tagName}: ${tagError?.message}`)
        }

        // Create many-to-many relationship
        const { error: relationError } = await supabase
          .from('article_tags')
          .insert({
            article_id: savedArticle.id,
            tag_id: tag.id
          })

        if (relationError) {
          throw new Error(`Failed to link article to tag: ${relationError.message}`)
        }
      }
      console.info(`Saved ${article.tags.length} tags`)

      // === Process Comments ===
      // Add article_id reference to each comment
      const commentsWithRef = comments.map(comment => ({
        ...comment,
        article_id: savedArticle.id
      }))

      // Batch insert all comments
      const { error: commentsError } = await supabase
        .from('comments')
        .insert(commentsWithRef)

      if (commentsError) {
        throw new Error(`Failed to save comments: ${commentsError.message}`)
      }
      console.info(`Saved ${commentsWithRef.length} comments`)

      // === Mark Link as Processed ===
      // Set timestamp to prevent re-processing
      const processedAt = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('found_links')
        .update({
          processed_at: processedAt,
        })
        .eq('id', link.id)

      if (updateError) {
        throw new Error(`Failed to update link status: ${updateError.message}`)
      }
      console.info(`Updated ${link.id} with processed_at: ${processedAt}`)

      // Record success
      results.push({
        url: link.href,
        status: 'success'
      })
      console.info(`Processed ${link.href}`)
      console.info('---***---')

    } catch (error: unknown) {
      // Record failure (doesn't stop processing other links)
      results.push({
        url: link.href,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      console.error(`Failed to process ${link.href}:`, error)
    }
  }

  return {
    processed: results.length,
    results
  }
})
