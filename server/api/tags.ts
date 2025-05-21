import { defineEventHandler, createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  try {
    const { data, error } = await serverSupabaseServiceRole(event)
      .from('tags')
      .select('*')
    if (error) throw error
    return data
  } catch (err) {
    throw createError({ 
      statusCode: 500, 
      statusMessage: err instanceof Error ? err.message : 'Unknown error' 
    })
  }
})
