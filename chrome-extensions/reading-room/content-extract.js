// Content script injected on-demand to extract page metadata
(function () {
  function getMeta(name) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  }

  function getTitle() {
    return (
      getMeta('og:title') ||
      getMeta('twitter:title') ||
      document.title ||
      ''
    ).trim();
  }

  function getDescription() {
    return (
      getMeta('og:description') ||
      getMeta('twitter:description') ||
      getMeta('description') ||
      ''
    ).trim();
  }

  function getExcerpt() {
    const selectors = [
      'article p', '[role="main"] p', 'main p',
      '.post-content p', '.entry-content p',
      '.article-body p', '.story-body p',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const paragraphs = Array.from(els)
          .map(p => p.textContent.trim())
          .filter(t => t.length > 60)
          .slice(0, 3);
        if (paragraphs.length) return paragraphs.join('\n\n');
      }
    }
    const allP = document.querySelectorAll('p');
    return Array.from(allP)
      .map(p => p.textContent.trim())
      .filter(t => t.length > 80)
      .slice(0, 3)
      .join('\n\n');
  }

  function guessCategory() {
    const text = (document.title + ' ' + getDescription() + ' ' + window.location.href).toLowerCase();
    if (/marketing|brand|seo|content.strateg|social.media|advertis|campaign/.test(text)) return 'marketing';
    if (/tech|software|ai|machine.learn|coding|developer|programming|api|saas/.test(text)) return 'tech';
    if (/business|startup|revenue|growth|funding|invest|entrepreneur/.test(text)) return 'business';
    if (/industry|market.report|trend|forecast|sector|analysis/.test(text)) return 'industry';
    if (/research|study|paper|journal|academic|data|findings/.test(text)) return 'research';
    return 'other';
  }

  return {
    url: window.location.href,
    title: getTitle(),
    description: getDescription(),
    excerpt: getExcerpt(),
    siteName: getMeta('og:site_name') || '',
    author: getMeta('author') || getMeta('article:author') || '',
    publishedDate: getMeta('article:published_time') || getMeta('datePublished') || '',
    category: guessCategory(),
  };
})();
