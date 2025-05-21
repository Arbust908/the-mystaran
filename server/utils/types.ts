import type { Tables } from '../../database.types'
import type { QueryData } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// Base table types
export type Article = Tables<'articles'>
export type Category = Tables<'categories'>
export type Tag = Tables<'tags'>
export type Comment = Tables<'comments'>

// Pagination types
export interface PaginationMeta {
  total: number
  page: number
  totalPages: number
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

// Query response types
export type ArticleWithRelations = QueryData<ReturnType<typeof getArticleQuery>>

// Query builders
export const getArticleQuery = (event: H3Event) =>
  serverSupabaseServiceRole(event)
    .from('articles')
    .select(`
      id,
      title,
      images,
      summary,
      created_at,
      link,
      tags: article_tags (
        tag: tags ( id, name, slug )
      ),
      categories: article_categories (
        category: categories ( id, name )
      )
    `)
