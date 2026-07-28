// data/agents/core/reddit-fetch.js
//
// Phase A 전용 Reddit RSS fetcher. Node 18+ native fetch 사용.
// legacy data/crawlers/core/reddit-fetcher.js와 의도적으로 분리:
// - execSync(curl) 기반 구현은 Windows cmd.exe에서 인자 파싱이 깨짐
// - Self-contained: Phase A 스카웃은 legacy를 건드리지 않는다
//
// v2: og:description 크롤링 추가 — writer 입력 품질 향상
//
// Usage:
//   import { fetchRedditViaRSS } from './reddit-fetch.js'
//   const posts = await fetchRedditViaRSS('soccer', { maxArticles: 25 })

import { execSync } from "node:child_process";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REDDIT_BASE = "https://www.reddit.com";

const SKIP_AUTHORS = new Set(["AutoModerator", "2soccer2bot", "MatchThreadder"]);

const SKIP_PATTERNS = [
  /^daily discussion$/i,
  /^free talk/i,
  /^match thread/i,
  /^post.?match thread/i,
  /^monday moan/i,
  /^change my view/i,
  /^\[match thread\]/i,
  /^weekly.*(thread|discussion|megathread)/i,
  /^monthly.*(thread|discussion|megathread)/i,
  /^(meta|mod) (post|announcement)/i,
  /^\[megathread\]/i,
];

/**
 * @param {string} subreddit
 * @param {{maxArticles?: number, lookbackHours?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchRedditViaRSS(
  subreddit,
  { maxArticles = 25, lookbackHours = 24, timeoutMs = 20000 } = {}
) {
  const limit = Math.min(maxArticles * 3, 100);
  const url = `${REDDIT_BASE}/r/${subreddit}/hot.rss?limit=${limit}`;

  // Reddit는 Node native fetch의 TLS fingerprint를 429로 throttle한다(IP 무관, home·datacenter 둘 다).
  // curl은 통과 → Linux(Vultr 운영)는 curl 사용, Windows 로컬 dev는 native fetch fallback.
  let xml;
  if (process.platform !== "win32") {
    xml = execSync(
      `curl -s -L -H 'User-Agent: ${USER_AGENT}' --max-time ${Math.ceil(timeoutMs / 1000)} '${url}'`,
      { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 }
    );
    if (!xml) {
      throw new Error(`Reddit RSS /r/${subreddit} curl returned empty`);
    }
  } else {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Reddit RSS /r/${subreddit} returned HTTP ${res.status}`);
    }
    xml = await res.text();
  }
  if (
    xml.includes('<body class=theme-beta>') ||
    xml.includes("<!doctype html")
  ) {
    throw new Error(
      `Reddit RSS /r/${subreddit} blocked (likely TLS fingerprint)`
    );
  }

  const entries = parseAtomFeed(xml);
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;

  const filtered = entries
    .filter((e) => {
      if (SKIP_AUTHORS.has(e.author)) return false;
      if (SKIP_PATTERNS.some((p) => p.test(e.title))) return false;
      if (e.published && new Date(e.published).getTime() < cutoff) return false;
      return true;
    })
    .slice(0, maxArticles);

  // article 링크에서 og:description 크롤 (병렬, 5초 타임아웃)
  await enrichWithDescription(filtered);

  return filtered.map((e) => ({
    external_id: e.id.replace("t3_", ""),
    external_url: e.link,
    original_title: e.title,
    link_url: e.contentLink || null,
    media_type: e.mediaType || null,
    author: e.author,
    posted_at: e.published || new Date().toISOString(),
    score: 0,
    num_comments: 0,
    flair: null,
    description: e.description || null,
    article_text: e.articleText || null,
    og_image: e.ogImage || null,
  }));
}

// ============================================================================
// og:description enrichment — writer 입력 품질의 핵심
// ============================================================================

/**
 * article 타입 엔트리의 외부 URL에서 og:description을 가져옴.
 * 병렬 실행, 개별 실패는 무시 (description이 null로 남음).
 * Mutates entries in place.
 */
async function enrichWithDescription(entries) {
  const targets = entries.filter(
    (e) => e.contentLink && e.mediaType === "article"
  );
  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map(async (entry) => {
      try {
        const res = await fetch(entry.contentLink, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        if (!res.ok) return;

        // 첫 450KB까지 읽어서 meta 태그 + 본문 문단 추출.
        // 50KB → 450KB: 뉴스 사이트는 헤더/스크립트 프리앰블이 커서 본문 <p> 가
        // 한참 뒤에 나온다 (BBC 실측: 첫 <p> 가 157KB 지점). 본문은 writer 의
        // 팩트 재료라 여기서 놓치면 기사가 두 줄짜리로 나온다.
        const reader = res.body.getReader();
        let html = "";
        while (html.length < 450000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += new TextDecoder().decode(value);
        }
        reader.cancel();

        // og:description 우선
        const ogDesc =
          html.match(
            /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
          ) ||
          html.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i
          );
        if (ogDesc) {
          entry.description = decodeHTML(ogDesc[1]).slice(0, 400);
        } else {
          // fallback: meta name="description"
          const metaDesc =
            html.match(
              /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i
            );
          if (metaDesc) {
            entry.description = decodeHTML(metaDesc[1]).slice(0, 400);
          }
        }

        // og:image 추출 — embed(youtube/twitter) 감지 실패 시 fallback 이미지로 사용
        const ogImage =
          html.match(
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
          ) ||
          html.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
          ) ||
          html.match(
            /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
          );
        if (ogImage) {
          const raw = decodeHTML(ogImage[1]).trim();
          // 절대 URL만 채택. 상대 경로는 drop.
          if (/^https?:\/\//i.test(raw)) {
            entry.ogImage = raw;
          }
        }

        // 기사 본문 문단 추출 — writer 가 og:description(1~2문장)만 받으면
        // 기사가 짧고 얕게 나온다. 본문 앞부분을 팩트 재료로 함께 넘긴다.
        const articleText = extractArticleText(html);
        if (articleText) {
          entry.articleText = articleText;
        }
      } catch {
        // timeout or network error — skip, description/ogImage stays null
      }
    })
  );
}

// 본문 <p> 문단 수집 — readability 라이브러리 없이 정규식으로 최소 구현.
// 목표는 완벽한 본문 복원이 아니라 "writer 에게 줄 팩트 재료 2,000여 자"다.
const BOILERPLATE_P =
  /cookie|subscri|newsletter|sign up|sign in|log in|all rights reserved|privacy policy|terms of (use|service)|follow us|download the app|advertis|getty images|©/i;

export function extractArticleText(html) {
  // 스크립트/스타일/템플릿 블록 제거 후 <p> 만 수집
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "");

  const paragraphs = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  let total = 0;
  while ((m = pRegex.exec(stripped)) !== null && total < 2800) {
    const text = decodeHTML(m[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    // 네비게이션/캡션/약관 조각 걸러내기 — 짧거나 보일러플레이트면 스킵
    if (text.length < 40 || BOILERPLATE_P.test(text)) continue;
    paragraphs.push(text);
    total += text.length;
  }

  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n").slice(0, 2800);
}

// ============================================================================
// Atom feed parser (regex 기반, XML 라이브러리 불필요)
// ============================================================================

function parseAtomFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    const id = extractTag(block, "id") || "";
    const title = decodeHTML(extractTag(block, "title") || "");
    const link = extractAttr(block, "link", "href") || "";
    const published =
      extractTag(block, "published") || extractTag(block, "updated") || "";
    const author = extractNestedTag(block, "author", "name") || "";

    const rawContent = extractTag(block, "content") || "";
    const content = decodeHTML(rawContent);
    let contentLink = null;
    const linkMatch = content.match(/\[link\]<\/a>/);
    if (linkMatch) {
      const hrefMatch = content
        .slice(0, linkMatch.index)
        .match(/href="([^"]+)"[^>]*>\s*$/);
      if (hrefMatch && !hrefMatch[1].includes("reddit.com/r/")) {
        contentLink = hrefMatch[1];
      }
    }

    let mediaType = null;
    const checkUrl = contentLink || "";
    if (/youtu\.?be(\.com)?/i.test(checkUrl)) {
      mediaType = "youtube";
    } else if (/(?:twitter\.com|x\.com)\/[\w]+\/status/i.test(checkUrl)) {
      mediaType = "twitter";
    } else if (/instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\//i.test(checkUrl)) {
      mediaType = "instagram";
    } else if (
      /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(checkUrl) ||
      /i\.redd\.it|imgur\.com/i.test(checkUrl)
    ) {
      mediaType = "image";
    } else if (contentLink) {
      mediaType = "article";
    }

    entries.push({
      id,
      title,
      link,
      published,
      author,
      contentLink,
      mediaType,
      description: null, // enrichWithDescription이 채움
    });
  }

  return entries;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`));
  return m ? m[1] : null;
}

function extractNestedTag(xml, parent, child) {
  const parentM = xml.match(
    new RegExp(`<${parent}>[\\s\\S]*?<\\/${parent}>`)
  );
  if (!parentM) return null;
  return extractTag(parentM[0], child);
}

function decodeHTML(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
