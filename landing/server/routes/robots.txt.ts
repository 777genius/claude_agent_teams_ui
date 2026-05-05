export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const siteUrl = (config.public.siteUrl as string) || "https://777genius.github.io/claude_agent_teams_ui";

  setHeader(event, "content-type", "text/plain; charset=utf-8");

  return `User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
Sitemap: ${siteUrl}/docs/sitemap.xml
`;
});
