import type { Tables } from '../../database.types'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// Base table types
export type Article = Tables<'articles'>
export type Category = Tables<'categories'>
export type Tag = Tables<'tags'>
export type Comment = Tables<'comments'>


// Pagination types
export interface PaginationMeta {
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// Query response types
export type ArticleWithRelations = Article & {
  categories?: Array<{
    category: Category;
  }>;
  tags?: Array<{
    tag: Tag;
  }>;
};

// Query builders and helpers
export const getArticleQuery = (event: H3Event) =>
  serverSupabaseServiceRole(event)
    .from('articles')
    .select(`
      *,
      tags: article_tags (
        tag: tags ( id, name, slug )
      ),
      categories: article_categories (
        category: categories ( id, name )
      )
    `);

export const updateArticle = (event: H3Event, id: string, data: Partial<Article>) =>
  serverSupabaseServiceRole(event)
    .from('articles')
    .update(data)
    .eq('id', id);
