/**
 * ALEXANDRIAN SCRAPING - Main Crawler Endpoint
 *
 * This is the primary crawling endpoint that systematically discovers and catalogs
 * all links on The Alexandrian blog. It implements a breadth-first crawling strategy.
 *
 * Architecture Role:
 * - Entry point for site-wide link discovery
 * - Manages crawl state through found_links table
 * - Deduplicates and classifies discovered links
 * - First step in the scraping pipeline (before link-process.ts and scrap.ts)
 *
 * Crawling Algorithm:
 * 1. Load existing links from database
 * 2. Clean up duplicates and normalize URLs
 * 3. Identify and mark file resources
 * 4. Build visited and toVisit sets
 * 5. While toVisit has URLs:
 *    a. Pop next URL from toVisit
 *    b. Fetch page and extract links
 *    c. Filter for internal, unvisited links
 *    d. Add new links to database with Pending status
 *    e. Mark current URL as Visited
 * 6. Return list of all visited URLs
 *
 * Database States (CrawlStatus):
 * - Pending (0): Discovered but not crawled
 * - Visited (1): Successfully crawled for links
 * - Error (2): Failed to fetch/parse
 * - File (4): File resource (not HTML)
 * - Tag (5): Tag listing page
 * - Category (6): Category listing page
 * - Article (7): Article page (ready for scraping)
 *
 * Usage:
 * Start initial crawl:
 * GET /api/crawl
 *
 * Resume existing crawl:
 * GET /api/crawl (automatically resumes from Pending links)
 *
 * Note: This is a long-running operation. Consider implementing as a background job
 * or with pagination for production use.
 *
 * @endpoint GET /api/crawl
 * @returns {{ links: string[] }} Array of all visited URLs
 */

import { serverSupabaseClient } from '#supabase/server';
import type { LinkRecord } from "../utils/crawler"
import { CrawlStatus, fileExts, getDuplicateLinks, getFileLinks, getLinksFromUrl, getNormalizedDuplicateLinks } from "../utils/crawler"

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event);

  // === PHASE 1: Load Existing Crawl State ===
  const { data, error: loadError } = await supabase.from('found_links').select('*');
  if (loadError || !data) {
    console.error('Failed to load existing links from Supabase:', loadError);
    return;
  }

  const existing = data as LinkRecord[];
  const visited = new Set<string>();  // URLs already crawled for links
  const toVisit = new Set<string>();  // URLs queued for crawling

  if (existing.length === 0) {
    console.info('No existing links found, starting from scratch');
    return;
  }

  // === PHASE 2: Clean Up Duplicate Links ===
  // Find exact duplicates (same href appearing multiple times)
  const duplicates = await getDuplicateLinks(existing);
  // Find normalized duplicates (URLs differing only by query params or hash)
  const normalizedDuplicates = await getNormalizedDuplicateLinks(duplicates);
  const toDeleteIds = new Set([...duplicates, ...normalizedDuplicates].map(rec => rec.id));
  const deletePromises = [];

  // Delete duplicate records in parallel
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

  // === PHASE 3: Identify and Mark File Resources ===
  // Files (images, PDFs, etc.) should not be crawled for links
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

  // === PHASE 4: Build Crawl Queue ===
  // Populate visited and toVisit sets from existing records
  existing?.forEach(rec => {
    // Skip file links (already processed above)
    if (updatedUrls.includes(rec.href)) return;

    // Add to visited if already crawled
    if (rec.status === CrawlStatus.Visited) visited.add(rec.href);
    // Add to queue if pending
    else if (rec.status === CrawlStatus.Pending) toVisit.add(rec.href);
  });

  console.info(`Loaded ${data.length} links from Supabase`);
  console.info(`with ${visited.size} visited links`);
  console.info(`and ${toVisit.size} links to visit`);
  console.info(`Total ${visited.size + toVisit.size + updatedUrls.length} (initial: ${data.length}|${existing.length})`);

  // === PHASE 5: Initialize Crawl if Needed ===
  // If no pending links and haven't crawled homepage, start there
  if (toVisit.size === 0 && !visited.has('https://thealexandrian.net/')) {
    toVisit.add('https://thealexandrian.net/');
  }

  // === PHASE 6: Main Crawl Loop ===
  // Process each URL in the queue until empty
  while (toVisit.size > 0) {
    // Get next URL from queue (Set.values() returns iterator)
    const currentUrl = toVisit.values().next().value as string;
    console.log(`Starting ${currentUrl.replace('https://thealexandrian.net', '')}`);
    console.log('--- * ---');

    // Create snapshot of visited set for link filtering
    const _visited = new Set<string>([...visited]);

    // Double-check if URL is a file resource
    const isFile = fileExts.some(ext => currentUrl.endsWith(ext));
    if (isFile) {
      updatePromises.push(
        supabase
          .from('found_links')
          .update({ status: CrawlStatus.File })
          .eq('href', currentUrl)
          .select()
          .then(() => currentUrl)
      );
      continue;
    }

    // Fetch page and extract links
    const foundLinks = await getLinksFromUrl(currentUrl, _visited)

    // Mark URL as processed
    visited.add(currentUrl);
    toVisit.delete(currentUrl);

    // Update database with crawl result
    console.info(`Updating ${currentUrl}`)
    if (foundLinks === null) {
      // Fetch failed - mark as Error
      const { error: updateError } = await supabase
        .from('found_links')
        .update({ status: CrawlStatus.Error })
        .eq('href', currentUrl)
        .select();

      if (updateError) {
        console.error('Failed to update link status in Supabase:', updateError);
        return;
      }
    } else {
      // Fetch succeeded - mark as Visited
      const { error: updateError } = await supabase
        .from('found_links')
        .update({ status: CrawlStatus.Visited })
        .eq('href', currentUrl)
        .select();

      if (updateError) {
        console.error('Failed to update link status in Supabase:', updateError);
        return;
      }
    }

    // Skip to next URL if fetch failed
    if (foundLinks === null) continue;

    // Add newly discovered links to queue
    const finalAdd: string[] = [];
    foundLinks.forEach(link => {
      // Only add if not already visited or queued
      if (!visited.has(link) && !toVisit.has(link)) {
        toVisit.add(link);
        finalAdd.push(link);
      }
    });

    // Log and insert new links
    if (finalAdd.length !== 0) {
      console.info(finalAdd.map(link => link.replace('https://thealexandrian.net', '')));
      console.info(`Adding ${finalAdd.length} links to DB`)
      console.log('--- * ---');
    }

    // Batch insert new links with Pending status
    const { error: insertError } = await supabase
      .from('found_links')
      .insert(
        finalAdd.map(link => ({
          href: link,
          status: CrawlStatus.Pending,
        }))
      )
      .select();

    if (insertError) {
      console.error('Failed to insert links into Supabase:', insertError);
      return;
    }

    // Progress logging
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