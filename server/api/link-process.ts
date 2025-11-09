/**
 * ALEXANDRIAN SCRAPING - Link Classification & Taxonomy Processor
 *
 * Processes discovered links to extract and populate the tags and categories tables.
 * This endpoint identifies tag and category listing pages from the crawled links
 * and creates database entries for them.
 *
 * Architecture Role:
 * - Second step in the scraping pipeline (after crawl.ts, before scrap.ts)
 * - Extracts taxonomy metadata from URLs
 * - Populates tags and categories tables
 * - Classifies links by type (Tag vs Category)
 *
 * URL Pattern Matching:
 * - Tag pages: /tag/{tag-name} or /tag/{tag-name}/page/{number}
 * - Category pages: /category/{category-name} or /category/{category-name}/page/{number}
 *
 * Processing Flow:
 * 1. Query links with CrawlStatus.Tag (5) or CrawlStatus.Category (6)
 * 2. Extract slug from URL using regex
 * 3. Convert slug to human-readable name (replace dashes with spaces)
 * 4. Title-case the name
 * 5. Insert into tags or categories table (upsert on conflict)
 *
 * URL Examples:
 * - /tag/rpg => Tag: "RPG"
 * - /category/game-mastering/page/2 => Category: "Game Mastering"
 *
 * Note: This endpoint is called after crawl.ts has discovered all links
 * and before scrap.ts extracts article content.
 *
 * @endpoint GET /api/link-process
 * @returns {{ data: string }} Success status
 */

import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~~/database.types';
import { CrawlStatus } from '../utils/crawler';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);

  /**
   * Process found links and extract taxonomy data.
   * Handles both tags and categories with configurable regex patterns.
   */
  async function processFoundLinks() {
    /**
     * Generic handler for processing tag or category links.
     *
     * @param statusValue - CrawlStatus to filter by (Tag or Category)
     * @param table - Database table name ('tags' or 'categories')
     * @param regex - Pattern to extract slug from URL
     */
    async function handle(
      statusValue: CrawlStatus,
      table: 'tags' | 'categories',
      regex: RegExp
    ) {
      console.table({ statusValue, table, regex });

      // Fetch all links with specified status (Tag or Category)
      const { data: links, error: loadError } = await supabase
        .from('found_links')
        .select('id, href')
        .eq('status', statusValue);

      if (loadError) {
        console.error(`Failed to load ${table} from Supabase:`, loadError);
        return {
          error: loadError,
        }
      }

      console.info(`Found ${links?.length} links to process`);

      // Process each link individually
      for (const link of links || []) {
        // Extract slug from URL using regex
        // Example: /tag/rpg/page/2 => captures "rpg"
        const m = link.href?.match(regex);
        console.log('Link:', link.href);
        console.log('Match:', m);

        if (!m) {
          // Couldn't parse slug from URL - mark as error
          await supabase
            .from('found_links')
            .update({ status: CrawlStatus.Error })
            .eq('id', link.id);
          continue;
        }

        // Extract slug from regex match
        const slug = m[1];
        console.log('Slug:', slug);

        // Convert slug to readable name (replace dashes with spaces)
        const name = slug.replace(/-/g, ' ');
        console.log('Name:', name);

        // Title-case the name (capitalize first letter of each word)
        const row  = {
          name: name.replace(/\b\w/g, c => c.toUpperCase()),
          description: ''
        };
        console.log('Row:', row);

        // Insert into tags or categories table
        // If name already exists, this will fail silently (duplicate key)
        const { error } = await supabase
          .from(table)
          .insert(row);

        if (error) {
          console.error(`upsert ${table}`, error);
        }
      }
    }

    // Process tag links (status = 5)
    // Pattern: /tag/{tag-name} or /tag/{tag-name}/page/{number}
    await handle(
      CrawlStatus.Tag,
      'tags',
      /\/tag\/([^\/]+)(?:\/page\/\d+)?/
    );

    // Process category links (status = 6)
    // Pattern: /category/{category-name} or /category/{category-name}/page/{number}
    await handle(
      CrawlStatus.Category,
      'categories',
      /\/category\/([^\/]+)(?:\/page\/\d+)?/
    );
  }
  
  await processFoundLinks().catch(console.error);

  return {
    data: 'ok',
  }
})