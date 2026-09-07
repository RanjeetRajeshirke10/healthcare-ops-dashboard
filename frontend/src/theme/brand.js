/**
 * Brand/chrome colors — buttons, active nav, badges, panel accents.
 *
 * Switched from violet to a clinical blue (2026-09-06, at the user's
 * request to use "appropriate colors" for a healthcare dashboard — blue
 * reads as trustworthy/medical rather than generic-SaaS). This is the only
 * file that needed to change: every component reads BRAND.* rather than
 * hardcoding hex, so the whole app's accent follows from here.
 *
 * Separate from theme/chartColors.js: that file's palette is validated for
 * data-encoding (CVD-safe categorical/status colors) and stays untouched;
 * this one is just UI chrome.
 */
export const BRAND = {
  primary: '#1D6FE0',
  primaryHover: '#1857B3',
  primaryTint: '#EAF1FD', // light wash for active nav / panel backgrounds
  primaryBorder: '#BFD9F9',
}

export const PAGE_BG = '#F7F8FA'
