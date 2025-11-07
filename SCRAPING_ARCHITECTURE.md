# The Mystaran - Alexandrian Scraping Architecture

> **ALEXANDRIAN SCRAPING DOCUMENTATION**
> Complete guide to the web scraping system that powers The Mystaran

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Database Schema](#database-schema)
- [Pipeline Stages](#pipeline-stages)
- [File Structure](#file-structure)
- [Setup & Configuration](#setup--configuration)
- [Running the Scraper](#running-the-scraper)
- [API Endpoints](#api-endpoints)
- [Data Flow](#data-flow)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Mystaran is a modern web application that scrapes and republishes content from [The Alexandrian](https://thealexandrian.net/), a popular tabletop RPG blog. The scraping system is built with:

- **Nuxt 3**: Server-side API endpoints
- **Supabase**: PostgreSQL database for storing articles, tags, categories, and metadata
- **JSDOM**: HTML parsing and content extraction
- **OpenRouter**: Optional AI enhancement for content, titles, and summaries

### Goals

1. **Comprehensive crawling**: Discover all pages on thealexandrian.net
2. **Content extraction**: Parse article HTML into structured data
3. **Relationship mapping**: Extract and link tags, categories, and comments
4. **Data preservation**: Maintain original WordPress IDs and metadata
5. **AI enhancement**: Optionally improve content with modern styling and summaries

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE ALEXANDRIAN SCRAPING PIPELINE             │
└─────────────────────────────────────────────────────────────────┘

1. DISCOVERY PHASE
   ┌─────────────┐
   │   crawl.ts  │  ← Entry point: Discovers all links
   └──────┬──────┘
          │ Breadth-first crawling
          │ URL normalization
          │ Duplicate detection
          ↓
   ┌──────────────┐
   │ found_links  │  ← Database: Stores discovered URLs with status
   └──────┬───────┘
          │ Status: Pending → Visited
          │ Classification: Article, Tag, Category, File

2. CLASSIFICATION PHASE
   ┌─────────────────┐
   │ link-process.ts │  ← Extracts taxonomy metadata
   └──────┬──────────┘
          │ Regex pattern matching
          │ Slug extraction
          ↓
   ┌──────────────────────┐
   │  tags + categories   │  ← Database: Populated from URLs
   └──────────────────────┘

3. EXTRACTION PHASE
   ┌────────────────┐
   │   scrap.ts     │  ← Batch article processor
   │      OR         │
   │ process-links  │  ← Single article processor
   └───────┬────────┘
           │ Calls scraper.ts
           │ HTML parsing (JSDOM)
           ↓
   ┌──────────────┐
   │ scraper.ts   │  ← Content extraction
   └──────┬───────┘
          │ RawArticle + RawComment objects
          ↓
   ┌───────────────────────────────┐
   │  articles + comments          │  ← Database: Article content
   │  article_tags                 │
   │  article_categories           │
   └───────────────────────────────┘

4. ENHANCEMENT PHASE (Optional)
   ┌──────────────────────┐
   │ article.controller   │  ← AI enhancement utilities
   └──────┬───────────────┘
          │ OpenRouter API
          │ Tailwind CSS styling
          │ Title optimization
          │ Summary generation
          ↓
   ┌──────────────┐
   │   articles   │  ← Enhanced: summary, enhanced_content, optimized_title
   └──────────────┘
```

---

## Database Schema

### Core Tables

#### `found_links`
Tracks all discovered URLs and their processing status.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `href` | TEXT | Full URL (unique) |
| `status` | INTEGER | CrawlStatus enum (0-7) |
| `processed_at` | TIMESTAMP | When article was scraped (NULL = unprocessed) |
| `created_at` | TIMESTAMP | When link was discovered |

**CrawlStatus Values:**
- `0` Pending: Discovered but not crawled
- `1` Visited: Successfully crawled for links
- `2` Error: Failed to fetch/parse
- `4` File: File resource (image, PDF, etc.)
- `5` Tag: Tag listing page
- `6` Category: Category listing page
- `7` Article: Article page (ready for scraping)

#### `articles`
Stores article content and metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `old_id` | INTEGER | Original WordPress post ID |
| `title` | TEXT | Article title |
| `content` | TEXT | Full HTML content |
| `link` | TEXT | Canonical URL (unique) |
| `images` | TEXT[] | Array of image URLs |
| `created_at` | TIMESTAMP | Publication date |
| `summary` | TEXT | AI-generated summary (optional) |
| `enhanced_content` | TEXT | AI-enhanced HTML (optional) |
| `optimized_title` | TEXT | AI-optimized title (optional) |

#### `tags` & `categories`
Taxonomy tables for organizing articles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Display name (unique) |
| `slug` | TEXT | URL-friendly slug |
| `description` | TEXT | Optional description |

#### `article_tags` & `article_categories`
Junction tables for many-to-many relationships.

| Column | Type | Description |
|--------|------|-------------|
| `article_id` | UUID | Foreign key → articles |
| `tag_id`/`category_id` | UUID | Foreign key → tags/categories |

#### `comments`
Reader comments on articles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `old_id` | INTEGER | Original WordPress comment ID |
| `article_id` | UUID | Foreign key → articles |
| `author` | TEXT | Comment author name |
| `content` | TEXT[] | Array of paragraph text |
| `created_at` | TIMESTAMP | Comment date |

---

## Pipeline Stages

### Stage 1: Link Discovery (`/api/crawl`)

**Purpose:** Systematically discover all pages on thealexandrian.net

**Algorithm:**
1. Load existing links from `found_links` table
2. Clean duplicates and normalize URLs
3. Mark file resources (images, PDFs) with status = 4
4. Build `visited` and `toVisit` sets from existing records
5. Main loop:
   - Pop next URL from `toVisit`
   - Fetch HTML and extract links (via `crawler.ts`)
   - Filter for internal, unvisited links
   - Insert new links with status = 0 (Pending)
   - Mark current URL with status = 1 (Visited)
6. Repeat until `toVisit` is empty

**Key Features:**
- Breadth-first traversal
- URL normalization (remove query params and hash fragments)
- Duplicate detection (exact and normalized)
- File type detection
- Rate limiting (1 second delay between requests)
- Resumable (loads existing state from database)

**Output:** `found_links` table populated with all discovered URLs

---

### Stage 2: Taxonomy Extraction (`/api/link-process`)

**Purpose:** Extract tags and categories from URL patterns

**Process:**
1. Query links with status = 5 (Tag) or 6 (Category)
2. For each link:
   - Extract slug from URL using regex
     - Tags: `/tag/{slug}` or `/tag/{slug}/page/{n}`
     - Categories: `/category/{slug}` or `/category/{slug}/page/{n}`
   - Convert slug to readable name (replace dashes with spaces)
   - Title-case the name
   - Insert into `tags` or `categories` table (ignore duplicates)

**URL Examples:**
```
/tag/rpg                         → Tag: "RPG"
/category/game-mastering/page/2  → Category: "Game Mastering"
/tag/node-based-design           → Tag: "Node Based Design"
```

**Output:** `tags` and `categories` tables populated

---

### Stage 3: Article Extraction (`/api/scrap` or `/api/process-links`)

**Purpose:** Extract article content from HTML and save to database

#### Option A: Batch Processing (`/api/scrap`)

**Best for:** Initial scraping, processing many articles

**Process:**
1. Query all unprocessed Article links (status = 7, `processed_at` IS NULL)
2. For each link:
   - Call `scrapeArticles(url)` to extract HTML content
   - Insert article record
   - Upsert categories and create `article_categories` relationships
   - Upsert tags and create `article_tags` relationships
   - Insert comments with `article_id` reference
   - Set `processed_at` timestamp
3. Return array of results (success/error per link)

**Error Handling:** Each link processed independently; one failure doesn't stop others

#### Option B: Single Processing (`/api/process-links`)

**Best for:** Scheduled jobs, manual testing, recovery from failures

**Process:**
1. Query ONE oldest unprocessed Article link (FIFO order)
2. Check if article already exists (duplicate protection)
3. If new:
   - Scrape article content
   - Insert article
   - Process tags and relationships
   - Mark as processed
4. On error: Attempt cleanup of partial inserts

**Key Differences:**
- Processes 1 link per request (vs batch)
- Includes duplicate check before scraping
- Transactional safety with rollback
- Suitable for cron jobs or queues

---

### Stage 4: Content Extraction (Internal: `scraper.ts`)

**Purpose:** Parse WordPress HTML and extract structured data

**WordPress Theme Structure:**
The Alexandrian uses a specific HTML structure:
- Article container: `#yui-main .first .item.entry`
- Post ID: `id="post-{old_id}"`
- Title: `.itemhead h3 a`
- Date: `.itemhead .chronodata` (format: "January 1st, 2020")
- Content: `.storycontent` (raw HTML)
- Categories: `.metadata .category a`
- Tags: `.metadata .tags a`
- Comments: `.commentlist li` (with `id="comment-{old_id}"`)
- Related articles: `.yarpp-template-thumbnails` (YARPP plugin)

**Extraction Process:**
1. Fetch HTML from article URL
2. Parse with JSDOM
3. Extract metadata (ID, title, date)
4. Extract content HTML
5. Extract images from content
6. Remove related articles block from content
7. Extract categories and tags (as string arrays)
8. Extract comments (author, content paragraphs, date)
9. Extract related article IDs from YARPP plugin

**Date Parsing:**
- Article dates: "MMMM do, yyyy" → "YYYY-MM-DD"
- Comment dates: "MMMM do, yyyy - h:mm a" → "YYYY-MM-DD"

**Output:** `RawArticle` and `RawComment[]` objects

---

## File Structure

### Core Scraping Files

```
server/
├── api/                          # API endpoints
│   ├── crawl.ts                  # Link discovery (Stage 1)
│   ├── link-process.ts           # Taxonomy extraction (Stage 2)
│   ├── scrap.ts                  # Batch article processor (Stage 3)
│   └── process-links.ts          # Single article processor (Stage 3)
│
└── utils/                        # Utility modules
    ├── crawler.ts                # Link discovery utilities
    │   ├── getLinksFromUrl()     # Extract links from HTML
    │   ├── normalizeUrl()        # URL normalization
    │   ├── getDuplicateLinks()   # Duplicate detection
    │   └── getFileLinks()        # File type detection
    │
    ├── scraper.ts                # HTML parsing & content extraction
    │   └── scrapeArticles()      # Main extraction function
    │
    ├── types.ts                  # TypeScript type definitions
    │   ├── RawArticle           # Scraped article data
    │   ├── RawComment           # Scraped comment data
    │   ├── Article              # Database schema types
    │   └── ArticleWithRelations # Query result types
    │
    └── article.controller.ts     # Database operations & AI enhancement
        ├── getArticleQuery()             # Basic queries
        ├── getArticleQueryWithRelations() # Queries with joins
        ├── enhanceArticle()              # Full AI enhancement
        ├── getArticleEnhancedContent()   # AI content styling
        ├── getArticleSummary()           # AI summary generation
        └── getEnhancedTitle()            # AI title optimization
```

### Supporting Files

```
server/utils/
├── prompts.ts              # AI prompt templates
│   ├── BLOG_ENHANCEMENT    # Tailwind CSS styling prompt
│   ├── ARTICLE_SUMMARY     # Summary generation prompt
│   └── TITLE_OPTIMIZATION  # Title optimization prompt
│
└── openRouter.ts           # OpenRouter API client
    ├── callOpenRouter()            # API wrapper
    └── processArticleWithAI()      # Content processor
```

---

## Setup & Configuration

### Prerequisites

1. **Node.js** (v18+)
2. **Supabase account** (for database)
3. **OpenRouter API key** (optional, for AI enhancement)

### Installation

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
```

### Environment Variables

```bash
# Supabase configuration (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenRouter API (optional - for AI enhancement)
OPENROUTER_API_KEY=your-openrouter-key
```

### Database Setup

1. Create Supabase project
2. Run migrations to create tables:

```sql
-- found_links table
CREATE TABLE found_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  href TEXT UNIQUE NOT NULL,
  status INTEGER DEFAULT 0,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- articles table
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  old_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  link TEXT UNIQUE NOT NULL,
  images TEXT[],
  created_at TIMESTAMP NOT NULL,
  summary TEXT,
  enhanced_content TEXT,
  optimized_title TEXT
);

-- tags and categories
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- junction tables
CREATE TABLE article_tags (
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE article_categories (
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, category_id)
);

-- comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  old_id INTEGER,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT[] NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

3. Generate TypeScript types:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > database.types.ts
```

---

## Running the Scraper

### Development Server

```bash
yarn dev
```

### Complete Scraping Workflow

#### Step 1: Discover Links

Start the crawler to discover all pages:

```bash
curl http://localhost:3000/api/crawl
```

This will:
- Start from homepage (https://thealexandrian.net/)
- Discover all internal links
- Classify links by type (Article, Tag, Category, File)
- Store in `found_links` table

**Note:** This is a long-running operation. Consider running in background or implementing as a job.

#### Step 2: Extract Taxonomy

Extract tags and categories from URLs:

```bash
curl http://localhost:3000/api/link-process
```

This populates `tags` and `categories` tables.

#### Step 3: Scrape Articles

**Option A: Batch processing (all at once)**

```bash
curl http://localhost:3000/api/scrap
```

**Option B: Single processing (one at a time)**

```bash
# Call repeatedly until no links remain
while true; do
  curl http://localhost:3000/api/process-links
  sleep 2
done
```

#### Step 4: AI Enhancement (Optional)

Enhance articles with AI (requires OpenRouter API key):

```bash
# Enhance specific article
curl http://localhost:3000/api/ai/enhance?articleId=UUID

# Batch enhance all articles
curl http://localhost:3000/api/ai/remix-all
```

---

## API Endpoints

### Discovery Endpoints

#### `GET /api/crawl`
Main crawler endpoint. Discovers and catalogs all links.

**Response:**
```json
{
  "links": ["url1", "url2", "..."]
}
```

---

### Classification Endpoints

#### `GET /api/link-process`
Extracts taxonomy (tags/categories) from URLs.

**Response:**
```json
{
  "data": "ok"
}
```

---

### Extraction Endpoints

#### `GET /api/scrap`
Batch processes all unprocessed articles.

**Response:**
```json
{
  "processed": 42,
  "results": [
    { "url": "...", "status": "success" },
    { "url": "...", "status": "error", "error": "..." }
  ]
}
```

#### `GET /api/process-links`
Processes one article at a time.

**Response:**
```json
{
  "message": "Successfully processed link",
  "link": "https://thealexandrian.net/..."
}
```

---

### Enhancement Endpoints

#### `POST /api/ai/enhance`
AI-enhances a specific article.

**Query Params:**
- `articleId`: UUID of article to enhance

**Response:**
```json
{
  "enhancedContent": "<div class='...'> ... </div>",
  "summary": "Two-sentence summary...",
  "optimizedTitle": "Shorter Title"
}
```

#### `GET /api/ai/remix-all`
Batch enhances all articles.

---

## Data Flow

### Article Scraping Flow

```
User Request
    ↓
GET /api/scrap (or /api/process-links)
    ↓
Query found_links WHERE status=7 AND processed_at IS NULL
    ↓
For each link:
    ↓
    scrapeArticles(url)  [scraper.ts]
    ↓
    Parse HTML with JSDOM
    ↓
    Extract: title, content, date, images, categories, tags, comments
    ↓
    Return: RawArticle + RawComment[]
    ↓
    Insert article → articles table
    ↓
    Upsert categories → categories table
    Create relationships → article_categories
    ↓
    Upsert tags → tags table
    Create relationships → article_tags
    ↓
    Insert comments → comments table
    ↓
    Update found_links SET processed_at = NOW()
    ↓
Response: { processed: N, results: [...] }
```

---

## Error Handling

### Common Issues & Solutions

#### Issue: Duplicate Links

**Symptom:** Database constraint errors on `found_links.href`

**Solution:** The crawler automatically detects and removes duplicates:
- Exact duplicates (same href)
- Normalized duplicates (differ only by query params or hash)

#### Issue: Failed Article Scraping

**Symptom:** Articles not extracted, errors in logs

**Solutions:**
- Check HTML structure hasn't changed on thealexandrian.net
- Verify selectors in `scraper.ts` match current theme
- Check network connectivity
- Review error logs for specific parsing failures

#### Issue: Missing Categories/Tags

**Symptom:** Articles have no categories or tags

**Solution:** Run `/api/link-process` BEFORE `/api/scrap` to populate taxonomy tables.

#### Issue: Rate Limiting

**Symptom:** 429 or 503 errors from thealexandrian.net

**Solution:** Increase delay in `crawler.ts`:
```typescript
const foundLinks = await getLinksFromUrl(currentUrl, _visited, 2000); // 2 seconds
```

---

## Troubleshooting

### Check Crawl Progress

```sql
SELECT status, COUNT(*)
FROM found_links
GROUP BY status;
```

Expected output:
```
status | count
-------+-------
     0 |   123  -- Pending (not crawled)
     1 |  5432  -- Visited (crawled for links)
     4 |   789  -- Files
     5 |    45  -- Tags
     6 |    12  -- Categories
     7 |  3210  -- Articles
```

### Check Processing Progress

```sql
-- Unprocessed articles
SELECT COUNT(*)
FROM found_links
WHERE status = 7 AND processed_at IS NULL;

-- Processed articles
SELECT COUNT(*)
FROM articles;
```

### Check Database Relationships

```sql
-- Articles with tags
SELECT a.title, COUNT(at.tag_id) as tag_count
FROM articles a
LEFT JOIN article_tags at ON a.id = at.article_id
GROUP BY a.id, a.title
ORDER BY tag_count DESC
LIMIT 10;

-- Most used tags
SELECT t.name, COUNT(at.article_id) as article_count
FROM tags t
LEFT JOIN article_tags at ON t.id = at.tag_id
GROUP BY t.id, t.name
ORDER BY article_count DESC
LIMIT 20;
```

### Reset Scraping State

```sql
-- Reset all links to pending (re-crawl everything)
UPDATE found_links SET processed_at = NULL WHERE status = 7;

-- Delete all articles (keep links)
TRUNCATE articles CASCADE;
```

---

## Performance Optimization

### Batch Size

For large scraping jobs, consider pagination:

```typescript
// In scrap.ts, limit batch size
const { data: links } = await supabase
  .from('found_links')
  .select('*')
  .is('processed_at', null)
  .eq('status', CrawlStatus.Article)
  .limit(50); // Process 50 at a time
```

### Parallel Processing

For faster scraping, run multiple workers:

```bash
# Terminal 1
curl http://localhost:3000/api/process-links

# Terminal 2
curl http://localhost:3000/api/process-links

# Terminal 3
curl http://localhost:3000/api/process-links
```

### Database Indexes

Ensure indexes on frequently queried columns:

```sql
CREATE INDEX idx_found_links_status ON found_links(status);
CREATE INDEX idx_found_links_processed_at ON found_links(processed_at);
CREATE INDEX idx_articles_link ON articles(link);
CREATE INDEX idx_articles_old_id ON articles(old_id);
```

---

## Maintenance

### Periodic Tasks

1. **Clean up duplicates**: Run `/api/crawl` periodically (it auto-cleans)
2. **Verify relationships**: Check that all articles have tags/categories
3. **Monitor errors**: Check `found_links WHERE status = 2` for failed URLs
4. **Database backups**: Regular Supabase backups

### Monitoring

Track scraping progress with SQL queries:

```sql
-- Overall progress
SELECT
  COUNT(*) FILTER (WHERE status = 7) as total_articles,
  COUNT(*) FILTER (WHERE status = 7 AND processed_at IS NOT NULL) as processed,
  COUNT(*) FILTER (WHERE status = 7 AND processed_at IS NULL) as remaining
FROM found_links;
```

---

## License

This scraping system is part of The Mystaran project. Content belongs to The Alexandrian.

---

## Support

For issues or questions:
1. Check this documentation
2. Review inline code comments
3. Check Supabase logs
4. Review server logs (console output)
