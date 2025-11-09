import type { LinkRecord } from '../utils/crawler';
import { CrawlStatus, exportLinksToJson, getLinksFromUrl } from '../utils/crawler';
import { join } from 'node:path';

export default defineEventHandler(async (event) => {
  const startUrl = 'https://thealexandrian.net/';
  const visited = new Set<string>();
  const allLinks: LinkRecord[] = [];
  const toVisit = new Set<string>([startUrl]);

  console.info('Starting crawl from:', startUrl);

  while (toVisit.size > 0) {
    const currentUrl = toVisit.values().next().value as string;
    const shortUrl = currentUrl.replace('https://thealexandrian.net', '');
    console.info('Crawling:', shortUrl);

    const foundLinks = await getLinksFromUrl(currentUrl, visited);
    
    visited.add(currentUrl);
    toVisit.delete(currentUrl);

    // Add current URL to results
    allLinks.push({
      id: crypto.randomUUID(),
      href: currentUrl,
      visited: true,
      status: foundLinks === null ? CrawlStatus.Error : CrawlStatus.Visited,
    });

    if (foundLinks === null) {
      console.error('Failed to crawl:', currentUrl);
      continue;
    }

    // Add newly found links to the queue
    for (const link of foundLinks) {
      if (!visited.has(link) && !toVisit.has(link)) {
        toVisit.add(link);
        allLinks.push({
          id: crypto.randomUUID(),
          href: link,
          visited: false,
          status: CrawlStatus.Pending,
        });
      }
    }

    console.info('Visited:', visited.size, 'Pending:', toVisit.size, 'Total:', allLinks.length);
  }

  // Export to JSON
  const outputPath = join(process.cwd(), 'found_links.json');

  try {
    await exportLinksToJson(allLinks, outputPath);

    return {
      success: true,
      count: allLinks.length,
      visitedCount: visited.size,
      filePath: outputPath,
      message: 'Exported ' + allLinks.length + ' links to ' + outputPath,
    };
  } catch (error) {
    console.error('Failed to export links:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
