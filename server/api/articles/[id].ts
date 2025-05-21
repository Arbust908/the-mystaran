import { defineEventHandler, createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params as { id: string }

  try {
    const { data, error } = await serverSupabaseServiceRole(event)
      .from('articles')
      .select(`
        id,
        title,
        summary,
        content,
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
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  } catch (err) {
    // Return 404 if not found, 500 for other errors
    const status = err instanceof Error && err.message.includes('not_found') ? 404 : 500
    throw createError({ 
      statusCode: status, 
      statusMessage: err instanceof Error ? err.message : 'Unknown error' 
    })
  }
})
