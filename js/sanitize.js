// DOMPurify wrapper for safe innerHTML usage
// Include DOMPurify CDN before this script:
// <script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>

/**
 * Sanitize HTML string before inserting into DOM.
 * Falls back to text-only if DOMPurify is not loaded.
 */
function sanitizeHTML(dirty) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'small', 'code', 'pre', 'svg', 'path', 'circle'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'id', 'src', 'alt', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r', 'xmlns', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false,
    });
  }
  // Fallback: strip all HTML tags
  const tmp = document.createElement('div');
  tmp.textContent = dirty;
  return tmp.innerHTML;
}

/**
 * Safely set innerHTML on an element with sanitization.
 */
function safeInnerHTML(element, html) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    element.innerHTML = sanitizeHTML(html);
  }
}
