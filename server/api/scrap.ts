import { scrapeArticles } from "../utils/scraper"
import { supabase } from "../utils/supabaseClient"
import { CrawlStatus } from "../utils/crawler"

export default defineEventHandler(async (_event) => {
  // 1. Get unprocessed article links from found_links table
  const { data: links } = await supabase
    .from('found_links')
    .select('*')
    .is('processed_at', null)
    .eq('status', CrawlStatus.Article)

  if (!links || links.length === 0) {
    return {
      processed: 0,
      results: []
    }
  }

  const results = []
  
  // 2. Process each link
  for (const link of links) {
    try {
      // Scrape article and comments
      if (!link.href) {
        throw new Error('Link href is missing')
      }
      const { article, comments } = await scrapeArticles(link.href)
      
      // Prepare article data without categories and tags
      const articleToInsert = {
        old_id: article.old_id,
        title: article.title,
        link: article.link,
        images: article.images,
        created_at: article.created_at,
        content: article.content
      }

      // Save article to DB
      const { data: savedArticle, error: saveError } = await supabase
        .from('articles')
        .insert(articleToInsert)
        .select()
        .single()
        
      // Save comments with article reference
      if (!savedArticle || saveError) {
        throw new Error(saveError?.message || 'Failed to save article')
      }
      console.info(`Saved article ${savedArticle.id}`)

      // Handle categories
      for (const categoryName of article.categories) {
        // Insert or get category
        const { data: category, error: categoryError } = await supabase
          .from('categories')
          .upsert({ 
            name: categoryName, 
            description: '' 
          }, {
            onConflict: 'name'
          })
          .select()
          .single()

        if (categoryError || !category) {
          throw new Error(`Failed to save category ${categoryName}: ${categoryError?.message}`)
        }

        // Create article-category relationship
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

      // Handle tags
      for (const tagName of article.tags) {
        // Insert or get tag
        const { data: tag, error: tagError } = await supabase
          .from('tags')
          .upsert({ 
            name: tagName, 
            description: '',
            slug: tagName.toLowerCase().replace(/\s+/g, '-')
          }, {
            onConflict: 'name'
          })
          .select()
          .single()

        if (tagError || !tag) {
          throw new Error(`Failed to save tag ${tagName}: ${tagError?.message}`)
        }

        // Create article-tag relationship
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

      const commentsWithRef = comments.map(comment => ({
        ...comment,
        article_id: savedArticle.id
      }))
      
      const { error: commentsError } = await supabase
        .from('comments')
        .insert(commentsWithRef)
      
      // Mark link as processed with timestamp
      if (commentsError) {
        throw new Error(`Failed to save comments: ${commentsError.message}`)
      }
      console.info(`Saved ${commentsWithRef.length} comments`)

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
      
      results.push({
        url: link.href,
        status: 'success'
      })
      console.info(`Processed ${link.href}`)
      console.info('---***---')
    } catch (error: unknown) {
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
