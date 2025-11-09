/**
 * ALEXANDRIAN SCRAPING - Type Definitions
 *
 * This module provides TypeScript type definitions for the scraping system.
 * It includes both database schema types and scraping-specific types.
 *
 * Architecture Role:
 * - Defines data structures used throughout the scraping pipeline
 * - Provides type safety for database operations
 * - Separates raw scraped data types from database entity types
 *
 * Key Type Categories:
 * 1. Raw Types (RawArticle, RawComment): Data as scraped from HTML
 * 2. Database Types (Article, Tag, Category, Comment): Supabase table schemas
 * 3. Query Types (ArticleWithRelations): Complex joined query results
 * 4. Utility Types (PaginationMeta, PaginatedResponse): API response structures
 *
 * @module server/utils/types
 */

import type { Tables } from '../../database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseError = any;

/**
 * ALEXANDRIAN SCRAPING - Raw Article Data
 *
 * Represents article data as scraped directly from The Alexandrian blog HTML.
 * This is the intermediate format before database insertion.
 *
 * Key differences from Article (DB type):
 * - Contains arrays of category/tag names (strings) instead of IDs
 * - Includes old_id from original WordPress installation
 * - Has related_ids and comment_ids arrays for relationship mapping
 * - Content is raw HTML from the page
 */
export interface RawArticle {
  /** Original WordPress post ID from thealexandrian.net */
  old_id: number;
  /** Article title extracted from page */
  title: string;
  /** Full URL to the article */
  link: string;
  /** Array of image URLs found in article content */
  images: string[];
  /** Publication date in YYYY-MM-DD format */
  created_at: string;
  /** Full HTML content of the article */
  content: string;
  /** Category names as strings (not IDs) */
  categories: string[];
  /** Tag names as strings (not IDs) */
  tags: string[];
  /** Old WordPress comment IDs for this article */
  comment_ids: number[];
  /** Old WordPress IDs of related articles (from YARPP plugin) */
  related_ids: number[];
}

/**
 * ALEXANDRIAN SCRAPING - Raw Comment Data
 *
 * Represents comment data as scraped from The Alexandrian blog HTML.
 * This is the intermediate format before database insertion.
 */
export interface RawComment {
  /** Original WordPress comment ID */
  old_id: number;
  /** Comment author name */
  author: string;
  /** Array of paragraph text from the comment */
  content: string[];
  /** Comment date in YYYY-MM-DD format */
  created_at: string;
}

// ============================================================================
// DATABASE SCHEMA TYPES
// ============================================================================

/**
 * Article entity as stored in the 'articles' table.
 * Generated from Supabase schema.
 */
export type Article = Tables<'articles'>

/**
 * Category entity as stored in the 'categories' table.
 * Categories are broad topic classifications (e.g., "RPG", "Game Mastering").
 */
export type Category = Tables<'categories'>

/**
 * Tag entity as stored in the 'tags' table.
 * Tags are specific topic labels (e.g., "D&D", "Node-Based Design").
 */
export type Tag = Tables<'tags'>

/**
 * Comment entity as stored in the 'comments' table.
 * Comments are reader responses to articles.
 */
export type Comment = Tables<'comments'>

// ============================================================================
// PAGINATION TYPES
// ============================================================================

/**
 * Metadata for paginated responses.
 * Provides navigation information for large result sets.
 */
export interface PaginationMeta {
  /** Total number of items across all pages */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages available */
  totalPages: number;
  /** Whether more pages exist after this one */
  hasMore: boolean;
}

/**
 * Generic paginated response wrapper.
 * Used by API endpoints that return large datasets.
 *
 * @template T The type of data items in the response
 */
export interface PaginatedResponse<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  meta: PaginationMeta;
}

// ============================================================================
// QUERY RESPONSE TYPES
// ============================================================================

/**
 * Article with related categories and tags joined.
 * Used when fetching full article data with relationships.
 *
 * Structure matches Supabase query:
 * ```ts
 * .select(`
 *   *,
 *   tags: article_tags (tag: tags (*)),
 *   categories: article_categories (category: categories (*))
 * `)
 * ```
 */
export type ArticleWithRelations = Article & {
  /** Array of category relationships with nested category data */
  categories?: Array<{
    category: Category;
  }>;
  /** Array of tag relationships with nested tag data */
  tags?: Array<{
    tag: Tag;
  }>;
};
