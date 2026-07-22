// Dynamic event slugs can't be enumerated at build time; this route is served
// client-side via the SPA fallback (index.html) instead of being prerendered.
export const prerender = false;
