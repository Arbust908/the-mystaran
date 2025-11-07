/**
 * ALEXANDRIAN SCRAPING - Article Database Controller
 *
 * Provides database operations and AI enhancement utilities for articles.
 * This module serves as a data access layer between API endpoints and Supabase,
 * with additional AI processing capabilities via OpenRouter.
 *
 * Architecture Role:
 * - Abstraction layer for article database operations
 * - Query builders for simple and complex article fetches
 * - AI enhancement orchestration (content, title, summary)
 * - Used by API endpoints in /server/api/articles/ and /server/api/ai/
 *
 * Key Exports:
 * - getArticleQuery(): Simple article queries
 * - getArticleQueryWithRelations(): Articles with tags/categories
 * - updateArticle(): Update article fields
 * - enhanceArticle(): Full AI enhancement (content + title + summary)
 * - getArticleEnhancedContent(): AI-improved HTML content
 * - getArticleSummary(): AI-generated summary
 * - getEnhancedTitle(): AI-optimized title
 *
 * AI Enhancement:
 * Uses OpenRouter API to process article content through various prompts:
 * - Content enhancement: Tailwind CSS styling, semantic HTML
 * - Title optimization: Shorter, punchier titles
 * - Summary generation: Two-sentence article summaries
 *
 * @module server/utils/article.controller
 */

import type { H3Event } from 'h3'
import type { Article, ArticleWithRelations, SupabaseError } from './types';
import type { Database } from '~/database.types';
import { serverSupabaseServiceRole } from '#supabase/server'

/**
 * Initialize Supabase client with service role privileges.
 * Service role bypasses RLS policies for server-side operations.
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @returns {SupabaseClient} Configured Supabase client
 */
function initializeSupabaseClient(event: H3Event) {
  return serverSupabaseServiceRole<Database>(event);
}

/**
 * Get articles table query builder.
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @returns {QueryBuilder} Supabase query builder for articles table
 */
function supabaseArticle(event: H3Event) {
  return initializeSupabaseClient(event).from('articles');
}

/**
 * Build a select query for articles with optional custom columns.
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @param {string} select - Column selection string (default: '*')
 * @returns {QueryBuilder} Configured query builder
 */
function selectArticle(event: H3Event, select: string = '*') {
  return supabaseArticle(event).select(select);
}

/**
 * Get a basic article query builder.
 * Returns all article columns without relationships.
 *
 * Usage:
 * ```ts
 * const { data } = await getArticleQuery(event)
 *   .eq('id', articleId)
 *   .single();
 * ```
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @returns {QueryBuilder} Article query builder
 */
export function getArticleQuery(event: H3Event){
  return selectArticle(event);
}

/**
 * Get article query builder with related tags and categories.
 * Performs joins on article_tags and article_categories junction tables.
 *
 * Query Structure:
 * ```
 * articles.*
 * ├── tags[] (via article_tags)
 * │   └── tag (id, name, slug)
 * └── categories[] (via article_categories)
 *     └── category (id, name)
 * ```
 *
 * Usage:
 * ```ts
 * const { data } = await getArticleQueryWithRelations(event)
 *   .eq('id', articleId)
 *   .single();
 * // data.tags = [{ tag: { id, name, slug } }, ...]
 * // data.categories = [{ category: { id, name } }, ...]
 * ```
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @returns {QueryBuilder} Article query builder with relationships
 */
export function getArticleQueryWithRelations(event: H3Event) {
  const relationshipQuery = `
    *,
    tags: article_tags (
      tag: tags ( id, name, slug )
    ),
    categories: article_categories (
      category: categories ( id, name )
    )
  `

  return  selectArticle(event, relationshipQuery);
}
/**
 * Update article fields in the database.
 *
 * Usage:
 * ```ts
 * await updateArticle(event, articleId, {
 *   title: 'New Title',
 *   summary: 'Updated summary'
 * });
 * ```
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @param {string} articleId - UUID of the article to update
 * @param {Partial<Article>} data - Fields to update
 * @returns {QueryBuilder} Update query builder
 */
export async function updateArticle(event: H3Event, articleId: string, data: Partial<Article>) {
  return supabaseArticle(event)
    .update(data)
    .eq('id', articleId)
}

/**
 * Generate AI-enhanced HTML content with Tailwind CSS styling.
 *
 * Takes raw article HTML and returns semantically improved HTML with:
 * - Tailwind CSS classes for styling
 * - Better semantic structure
 * - Improved readability
 *
 * Uses BLOG_ENHANCEMENT prompt template.
 *
 * @param {string} content - Original article HTML content
 * @param {OpenRouterConfig} orConfig - OpenRouter API configuration
 * @returns {Promise<string>} Enhanced HTML content
 */
export async function getArticleEnhancedContent(content: Article['content'], orConfig: OpenRouterConfig) {
  const finalEnhancementPrompt = formatPrompt(BLOG_ENHANCEMENT, {
    articleContent: content
  });

  return await processArticleWithAI(finalEnhancementPrompt, orConfig);
}

/**
 * Generate AI-powered article summary.
 *
 * Creates a concise two-sentence summary capturing the article's main idea.
 * Considers title, categories, tags, and content for context.
 *
 * Uses ARTICLE_SUMMARY prompt template.
 *
 * @param {ArticleWithRelations} fullArticle - Complete article with relationships
 * @param {OpenRouterConfig} orConfig - OpenRouter API configuration
 * @returns {Promise<string>} Two-sentence article summary (cleaned)
 */
export async function getArticleSummary(fullArticle: ArticleWithRelations, orConfig: OpenRouterConfig) {

  const finalSummaryPrompt = formatPrompt(ARTICLE_SUMMARY, {
    articleContent: fullArticle.content,
    title: fullArticle.title,
    categories: fullArticle.categories?.map(c => c.category.name),
    tags: fullArticle.tags?.map(t => t.tag.name)
  });

  // Remove quotes and asterisks from AI response
  return (await processArticleWithAI(
          finalSummaryPrompt,
          orConfig
        )).replace(/["*]/g, '');
  }

/**
 * Generate AI-optimized article title.
 *
 * Creates a shorter, punchier title that:
 * - Is shorter than the original
 * - Removes boilerplate prefixes (e.g., "Ex-RPGNet Review:")
 * - Captures core value in engaging language
 * - Improves SEO and shareability
 *
 * Uses TITLE_OPTIMIZATION prompt template.
 *
 * @param {string} title - Original article title
 * @param {string} content - Article content for context
 * @param {OpenRouterConfig} orConfig - OpenRouter API configuration
 * @returns {Promise<string>} Optimized title (cleaned)
 */
export async function getEnhancedTitle(title: Article['title'], content: Article['content'], orConfig: OpenRouterConfig) {
  const finalTitlePrompt = formatPrompt(TITLE_OPTIMIZATION, {
    articleContent: content,
    title
  });

  // Remove quotes from AI response
  return (await processArticleWithAI(
          finalTitlePrompt,
          orConfig
        )).replace(/"/g, '');
}

/**
 * Perform full AI enhancement on an article.
 *
 * Orchestrates multiple AI operations:
 * 1. Fetch article with relationships from database
 * 2. Generate enhanced HTML content
 * 3. Generate article summary
 * 4. Generate optimized title
 *
 * This is the main entry point for AI enhancement workflows.
 *
 * @param {H3Event} event - Nuxt H3 event object
 * @param {string} articleId - UUID of article to enhance
 * @param {OpenRouterConfig} orConfig - OpenRouter API configuration
 * @returns {Promise<Object>} Object with enhancedContent, summary, optimizedTitle
 * @throws {Error} If article not found (404)
 *
 * @example
 * const { enhancedContent, summary, optimizedTitle } = await enhanceArticle(
 *   event,
 *   articleId,
 *   { apiKey: process.env.OPENROUTER_KEY }
 * );
 */
export async function enhanceArticle(event: H3Event, articleId: string, orConfig: OpenRouterConfig) {
  // Fetch article with full relationships
  const { data: article, error: fetchError } = await getArticleQueryWithRelations(event)
    .eq('id', articleId)
    .single() as {
    data: ArticleWithRelations | null;
    error: SupabaseError | null;
  };

  if (fetchError || !article) {
    throw createError({
      statusCode: 404,
      message: fetchError?.message || 'Article not found'
    });
  }

  // Run AI enhancements
  const enhancedContent = await getArticleEnhancedContent(article.content, orConfig);
  const summary = await getArticleSummary(article, orConfig);
  const optimizedTitle = await getEnhancedTitle(article.title, article.content, orConfig);

  return {
    enhancedContent,
    summary,
    optimizedTitle
  };
}