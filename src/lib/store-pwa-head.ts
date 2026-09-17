export function storePwaMeta(slug: string) {
  return [
    { name: "application-name", content: slug },
    { name: "apple-mobile-web-app-title", content: slug },
    { name: "theme-color", content: "#dc2626" },
  ];
}

export function storePwaLinks(slug: string) {
  const encodedSlug = encodeURIComponent(slug);
  const icon = `/api/public/store-icon/${encodedSlug}/any`;
  return [
    { rel: "manifest", href: `/api/public/manifest?loja=${encodedSlug}` },
    { rel: "icon", href: icon },
    { rel: "apple-touch-icon", href: icon },
  ];
}