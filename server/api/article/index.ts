import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/database.types'

type Article = Database['public']['Tables']['articles']['Row']

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event);
  const { data, error: articlesError } = await supabase.from('articles')
      .select('*')
      .order('created_at', { ascending: false })
  if (articlesError || !data) {
    console.error('Failed to load existing links from Supabase:', articlesError);
    return;
  }
  
  console.log(data)

  return {
    articles: data as Article[],
  }
})