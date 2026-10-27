export const prerender = true;

export function GET() {
	return new Response('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Oxford — Articles</title><description>工程项目、实验记录与技术文章。</description><link>/articles/</link></channel></rss>', {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
}
