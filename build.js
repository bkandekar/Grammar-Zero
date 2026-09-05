/**
 * ZeroErrorEnglish — Static Site Build Script
 * 
 * Non-negotiable content format:
 * All content is authored and stored as plain HTML files.
 * This script extracts metadata directly from <meta> tags and data-* attributes
 * in each HTML file, auto-generates the runtime search index (js/search-index.js),
 * sitemap.xml, and rss.xml, and handles scheduled publishing for GitHub Actions.
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://zeroerrorenglish.com';
const ROOT_DIR = __dirname;
const NOW = new Date();

console.log('🚀 ZeroErrorEnglish Static Site Builder');
console.log(`⏱️ Build run timestamp: ${NOW.toISOString()}`);

// Directories to scan for HTML content
const CONTENT_DIRS = [
  '',
  'learn',
  'topics',
  'blog',
  'practice',
  'quizzes',
  'books',
  'resources',
  'about',
  'contact',
  'search',
  'privacy-policy',
  'terms'
];

function extractMeta(html, name) {
  // Matches <meta name="..." content="..."> or <meta property="..." content="...">
  const regex = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["'](.*?)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  const reverseRegex = new RegExp(`<meta\\s+content=["'](.*?)["']\\s+(?:name|property)=["']${name}["']`, 'i');
  const reverseMatch = html.match(reverseRegex);
  return reverseMatch ? reverseMatch[1] : '';
}

function extractTitle(html) {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match ? match[1].replace(' | ZeroErrorEnglish', '').trim() : '';
}

function extractDataAttr(html, attr) {
  const regex = new RegExp(`data-${attr}=["'](.*?)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
}

function getHtmlFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      // Exclude build, git, node_modules, app (Android module)
      if (!['node_modules', '.git', '.gradle', 'app', 'gradle', '.build-outputs'].includes(file)) {
        results = results.concat(getHtmlFiles(fullPath));
      }
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

function runBuild() {
  const allFiles = getHtmlFiles(ROOT_DIR);
  console.log(`📄 Found ${allFiles.length} HTML files.`);

  const indexEntries = [];
  const publishedBlogPosts = [];
  let scheduledCount = 0;

  allFiles.forEach(filePath => {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const html = fs.readFileSync(filePath, 'utf-8');

    const title = extractTitle(html) || extractMeta(html, 'og:title') || path.basename(filePath);
    const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
    const category = extractMeta(html, 'category') || extractMeta(html, 'article:section') || 'Grammar';
    const tags = extractMeta(html, 'keywords') || extractMeta(html, 'tags') || '';
    const publishDateStr = extractMeta(html, 'publish-date') || extractMeta(html, 'article:published_time');
    const pageType = extractMeta(html, 'page-type') || (relativePath.startsWith('blog/') ? 'Blog' : relativePath.startsWith('topics/') ? 'Topic' : relativePath.startsWith('books/') ? 'Book' : relativePath.startsWith('quizzes/') ? 'Quiz' : relativePath.startsWith('practice/') ? 'Practice' : 'Page');

    // Calculate Clean URL
    let cleanUrl = '/' + relativePath.replace(/index\.html$/, '');
    if (cleanUrl === '/index.html') cleanUrl = '/';

    // Scheduled Publish Check
    if (publishDateStr) {
      const publishDate = new Date(publishDateStr);
      if (publishDate > NOW) {
        console.log(`⏳ Scheduled post pending: ${cleanUrl} (publish date: ${publishDateStr})`);
        scheduledCount++;
        return; // Withhold from search index & RSS until published
      }
    }

    // Add to search index
    indexEntries.push({
      title,
      desc: description,
      url: cleanUrl,
      type: pageType,
      category,
      tags
    });

    // Collect Blog Posts for RSS
    if (relativePath.startsWith('blog/') && relativePath !== 'blog/index.html') {
      publishedBlogPosts.push({
        title,
        description,
        url: `${SITE_URL}${cleanUrl}`,
        publishDate: publishDateStr ? new Date(publishDateStr) : NOW
      });
    }
  });

  console.log(`✅ Processed ${indexEntries.length} published pages (${scheduledCount} future-scheduled).`);

  // 1. Generate js/search-index.js
  const searchIndexDir = path.join(ROOT_DIR, 'js');
  if (!fs.existsSync(searchIndexDir)) fs.mkdirSync(searchIndexDir, { recursive: true });
  
  const searchIndexContent = `/**
 * Auto-generated search index for ZeroErrorEnglish.
 * Generated from HTML files at: ${NOW.toISOString()}
 */
window.SEARCH_INDEX = ${JSON.stringify(indexEntries, null, 2)};
`;
  fs.writeFileSync(path.join(searchIndexDir, 'search-index.js'), searchIndexContent, 'utf-8');
  console.log(`🔍 Generated js/search-index.js (${indexEntries.length} items)`);

  // 2. Generate sitemap.xml
  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  indexEntries.forEach(item => {
    sitemapXml += `  <url>
    <loc>${SITE_URL}${item.url}</loc>
    <lastmod>${NOW.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${item.url === '/' ? '1.0' : item.type === 'Topic' || item.type === 'Book' ? '0.9' : '0.8'}</priority>
  </url>
`;
  });
  sitemapXml += `</urlset>`;
  fs.writeFileSync(path.join(ROOT_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`🗺️ Generated sitemap.xml (${indexEntries.length} URLs)`);

  // 3. Generate rss.xml
  let rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>ZeroErrorEnglish — English Grammar &amp; Competitive Exam Prep</title>
  <link>${SITE_URL}</link>
  <description>Master English Grammar for competitive exams. Rules, practice questions, quizzes, and exam-focused KDP eBooks by Balu Kandekar.</description>
  <language>en-us</language>
  <lastBuildDate>${NOW.toUTCString()}</lastBuildDate>
`;
  publishedBlogPosts.forEach(post => {
    rssXml += `  <item>
    <title><![CDATA[${post.title}]]></title>
    <link>${post.url}</link>
    <description><![CDATA[${post.description}]]></description>
    <pubDate>${post.publishDate.toUTCString()}</pubDate>
    <guid>${post.url}</guid>
  </item>
`;
  });
  rssXml += `</channel>
</rss>`;
  fs.writeFileSync(path.join(ROOT_DIR, 'rss.xml'), rssXml, 'utf-8');
  console.log(`📡 Generated rss.xml (${publishedBlogPosts.length} posts)`);
}

runBuild();
