import { defineEventHandler, createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  try {
    const { data, error } = await serverSupabaseServiceRole(event)
      .from('articles')
      .select(`
        id,
        title,
        summary,
        created_at,
        link,
        images,
        tags: article_tags (
          tag: tags ( id, name, slug )
        ),
        categories: article_categories (
          category: categories ( id, name )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (err) {
    throw createError({ 
      statusCode: 500, 
      statusMessage: err instanceof Error ? err.message : 'Unknown error' 
    })
  }
})
