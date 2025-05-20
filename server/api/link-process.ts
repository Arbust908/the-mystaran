import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~~/database.types';
import { CrawlStatus } from '../utils/crawler';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);


  async function processFoundLinks() {
    // helper to upsert one link
    async function handle(
      statusValue: CrawlStatus,
      table: 'tags' | 'categories',
      regex: RegExp
    ) {
      console.table({ statusValue, table, regex });

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
// npx supabase gen types typescript --project-id kgrejhxortrsargiudrx --schema public > database.types.ts
      console.info(`Found ${links?.length} links to process`);
  
      for (const link of links || []) {
        const m = link.href?.match(regex);
        console.log('Link:', link.href);
        console.log('Match:', m);

        if (!m) {
          // couldn’t parse slug → mark error
          await supabase
            .from('found_links')
            .update({ status: CrawlStatus.Error })
            .eq('id', link.id);
          continue;
        }
  
        const slug = m[1];
        console.log('Slug:', slug);
        const name = slug.replace(/-/g, ' ');
        console.log('Name:', name);
        const row  = { name: name.replace(/\b\w/g, c => c.toUpperCase()), description: '' };
        console.log('Row:', row);
  
        // insert or ignore
        const { error } = await supabase
          .from(table)
          .insert(row);
  
        if (error) {
          console.error(`upsert ${table}`, error);
        }
      }
    }
  
    // run tags (status=5) and categories (status=6)
    await handle(CrawlStatus.Tag,      'tags',       /\/tag\/([^\/]+)(?:\/page\/\d+)?/);
    await handle(CrawlStatus.Category, 'categories', /\/category\/([^\/]+)(?:\/page\/\d+)?/);
  }
  
  await processFoundLinks().catch(console.error);

  return {
    data: 'ok',
  }
})