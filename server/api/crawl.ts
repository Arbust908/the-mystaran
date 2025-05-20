import { serverSupabaseClient } from '#supabase/server';
import type { LinkRecord } from "../utils/crawler"
import { CrawlStatus, fileExts, getDuplicateLinks, getFileLinks, getLinksFromUrl, getNormalizedDuplicateLinks } from "../utils/crawler"

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event);
  const { data, error: loadError } = await supabase.from('found_links').select('*');
  if (loadError || !data) {
    console.error('Failed to load existing links from Supabase:', loadError);
    return;
  }
  
  const existing = data as LinkRecord[];
  const visited = new Set<string>();
  const toVisit = new Set<string>();

  if (existing.length === 0) {
    console.info('No existing links found, starting from scratch');
    return;
  }

  const duplicates = await getDuplicateLinks(existing);
  const normalizedDuplicates = await getNormalizedDuplicateLinks(duplicates);
  const toDeleteIds = new Set([...duplicates, ...normalizedDuplicates].map(rec => rec.id));
  const deletePromises = [];

  if (toDeleteIds.size > 0) {
    for (const id of toDeleteIds) {
      deletePromises.push(
        supabase
          .from('found_links')
          .delete()
          .eq('id', id)
          .select()
          .then(() => id) // return something to count
      );
    }
  }
  const deletedUrls = await Promise.all(deletePromises);
  console.info(`Deleted ${deletedUrls.length} duplicate links`);

  // update File status
  const fileLinks = await getFileLinks(existing);
  const updatePromises = [];
  if (fileLinks.length > 0) {
    for (const rec of fileLinks) {
        updatePromises.push(
          supabase
            .from('found_links')
            .update({ status: CrawlStatus.File })
            .eq('id', rec.id)
            .select()
            .then(() => rec.id) // return something to count
        );
    }
  }
  const updatedUrls = await Promise.all(updatePromises);
  console.info(`Updated ${updatedUrls.length} file links`);

  existing?.forEach(rec => {
    if (updatedUrls.includes(rec.href)) return;
    if (rec.status === CrawlStatus.Visited) visited.add(rec.href);
    else if (rec.status === CrawlStatus.Pending) toVisit.add(rec.href);
  });

  
  console.info(`Loaded ${data.length} links from Supabase`);
  console.info(`with ${visited.size} visited links`);
  console.info(`and ${toVisit.size} links to visit`);
  console.info(`Total ${visited.size + toVisit.size + updatedUrls.length} (initial: ${data.length}|${existing.length})`);

  if (toVisit.size === 0 && !visited.has('https://thealexandrian.net/')) {
    toVisit.add('https://thealexandrian.net/');
  }

  while (toVisit.size > 0) {
    const currentUrl = toVisit.values().next().value as string;
    console.log(`Starting ${currentUrl.replace('https://thealexandrian.net', '')}`);
    console.log('--- * ---');
    const _visited = new Set<string>([...visited]);
    const isFile = fileExts.some(ext => currentUrl.endsWith(ext));
    if (isFile) {
      updatePromises.push(
        supabase
          .from('found_links')
          .update({ status: CrawlStatus.File })
          .eq('href', currentUrl)
          .select()
          .then(() => currentUrl) // return something to count
      );
      continue;
    }

    const foundLinks = await getLinksFromUrl(currentUrl, _visited)
    visited.add(currentUrl);
    toVisit.delete(currentUrl);
    // Update the current set of links to visit in the database
    console.info(`Updating ${currentUrl}`)
    if (foundLinks === null) {
      const { error: updateError } = await supabase.from('found_links').update({ status: CrawlStatus.Error }).eq('href', currentUrl).select();
      if (updateError) {
        console.error('Failed to update link status in Supabase:', updateError);
        return;
      }
    } else {
      const { error: updateError } = await supabase.from('found_links').update({ status: CrawlStatus.Visited }).eq('href', currentUrl).select();
      if (updateError) {
        console.error('Failed to update link status in Supabase:', updateError);
        return;
      }
    }
    if (foundLinks === null) continue;
    const finalAdd: string[] = [];
    foundLinks.forEach(link => {
      if (!visited.has(link) && !toVisit.has(link)) {
        toVisit.add(link);
        finalAdd.push(link);
      }
    });
    if (finalAdd.length !== 0) {
      console.info(finalAdd.map(link => link.replace('https://thealexandrian.net', '')));
      console.info(`Adding ${finalAdd.length} links to DB`)
      console.log('--- * ---');
    }
    // Add the found links to supabase
    const { error: insertError } = await supabase.from('found_links').insert([
      ...finalAdd.map(link => ({
        href: link,
        status: CrawlStatus.Pending,
      })),
    ])
    .select();
    if (insertError) {
      console.error('Failed to insert links into Supabase:', insertError);
      return;
    }

    console.log(`Visited ${visited.size} links`);
    console.log(`Pending ${toVisit.size} links`);
    console.log(`Total ${visited.size + toVisit.size + updatedUrls.length} (initial: ${existing.length})`);
    console.log('---------------------------')
  }

  console.log(`Finished crawling ${visited.size} links`);

  return {
    links: Array.from(visited),
  }
})