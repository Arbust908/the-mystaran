import { defineEventHandler, createError, getQuery } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { ArticleWithRelations, PaginatedResponse } from '~/server/utils/types'
import { getArticleQuery } from '~/server/utils/types'

export default defineEventHandler(async (event) => {
  try {
    // Get pagination parameters from query
    const query = getQuery(event)
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const offset = (page - 1) * limit

    // Get total count
    const { count, error: countError } = await serverSupabaseServiceRole(event)
      .from('articles')
      .select('*', { count: 'exact', head: true })

    if (countError) throw countError
    if (count === null) throw new Error('Failed to get total count')

    // Get paginated data
    const { data, error } = await getArticleQuery(event)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / limit)
    const hasMore = page < totalPages

    // Ensure data is never null
    const articles = data || []
    
    return {
      data: articles,
      meta: {
        total: count,
        page,
        totalPages,
        hasMore
      }
    } satisfies PaginatedResponse<ArticleWithRelations>
  } catch (err) {
    throw createError({ 
      statusCode: 500, 
      statusMessage: err instanceof Error ? err.message : 'Unknown error' 
    })
  }
})
