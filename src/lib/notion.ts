import { Client, isFullBlock, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import type { PortfolioBlock, PortfolioProject, ProjectFeed } from './types';

type Property = PageObjectResponse['properties'][string];

const previewProjects: PortfolioProject[] = ['PLANE', 'ARM', 'LEG', 'IMU', 'FOC'].map(
	(title, index) => ({
		id: `preview-${title.toLowerCase()}`,
		title,
		slug: title.toLowerCase(),
		summary: '详细内容将在 Notion 数据源连接成功后自动同步。',
		type: 'Project',
		featured: index < 2,
		tags: [],
		source: 'preview',
	}),
);

function richText(property?: Property): string {
	if (!property || !('type' in property)) return '';
	if (property.type === 'title') return property.title.map((item) => item.plain_text).join('');
	if (property.type === 'rich_text') return property.rich_text.map((item) => item.plain_text).join('');
	return '';
}

function option(property?: Property): string {
	if (!property || !('type' in property)) return '';
	if (property.type === 'select') return property.select?.name ?? '';
	if (property.type === 'status') return property.status?.name ?? '';
	if (property.type === 'multi_select') return property.multi_select[0]?.name ?? '';
	return '';
}

function url(property?: Property): string | undefined {
	return property && 'type' in property && property.type === 'url' ? (property.url ?? undefined) : undefined;
}

function files(property?: Property): string | undefined {
	if (!property || !('type' in property) || property.type !== 'files') return undefined;
	const first = property.files[0];
	if (!first) return undefined;
	return first.type === 'external' ? first.external.url : first.file.url;
}

function multiSelect(property?: Property): string[] {
	if (!property || !('type' in property) || property.type !== 'multi_select') return [];
	return property.multi_select.map((item) => item.name);
}

function checkboxOrShow(property?: Property): boolean {
	if (!property || !('type' in property)) return false;
	if (property.type === 'checkbox') return property.checkbox;
	return option(property).toLowerCase() === 'show';
}

function slugify(value: string, fallback: string): string {
	const slug = value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '');
	return slug || fallback;
}

function pageCover(page: PageObjectResponse): string | undefined {
	if (!page.cover) return undefined;
	return page.cover.type === 'external' ? page.cover.external.url : page.cover.file.url;
}

function mapPage(page: PageObjectResponse): PortfolioProject {
	const properties = page.properties;
	const titleProperty = Object.values(properties).find((property) => 'type' in property && property.type === 'title');
	const title = richText(properties['名称'] ?? properties.Name ?? titleProperty) || 'Untitled';
	const slugValue = richText(properties.Slug);
	const statusProperty = properties.ProjectStatus ?? properties.Status ?? properties['状态'] ?? properties[''] ?? Object.values(properties).find((property) => 'type' in property && property.type === 'status');

	return {
		id: page.id,
		title,
		slug: slugify(slugValue || title, page.id.slice(0, 8)),
		summary: richText(properties.Summary ?? properties['摘要']),
		type: option(properties.WebType ?? properties.Type) || 'Project',
		featured: checkboxOrShow(properties.Featured),
		status: option(statusProperty),
		website: url(properties.URL ?? properties.WebsiteURL ?? properties.WebsiteUrl),
		github: url(properties.GitHub ?? properties.Github),
		notionUrl: page.url,
		cover: files(properties.Cover) ?? pageCover(page),
		tags: multiSelect(properties.Tags ?? properties['标签']),
		updatedAt: page.last_edited_time,
		source: 'notion',
	};
}

let contentPromise: Promise<ProjectFeed> | undefined;

async function getNotionContent(): Promise<ProjectFeed> {
	if (contentPromise) return contentPromise;
	contentPromise = loadNotionContent();
	return contentPromise;
}

async function loadNotionContent(): Promise<ProjectFeed> {
	const token = import.meta.env.NOTION_TOKEN;
	const dataSourceId = import.meta.env.NOTION_DATA_SOURCE_ID;
	if (!token || !dataSourceId) return { projects: previewProjects, connected: false, message: 'Notion 环境变量尚未配置，当前显示预览数据。' };

	try {
		const notion = new Client({ auth: token, logger: () => undefined });
		let resolvedDataSourceId = dataSourceId;
		let response;
		try {
			response = await notion.dataSources.query({ data_source_id: resolvedDataSourceId, page_size: 100 });
		} catch {
			const database = await notion.databases.retrieve({ database_id: dataSourceId });
			const sources = 'data_sources' in database && Array.isArray(database.data_sources) ? database.data_sources : [];
			resolvedDataSourceId = sources[0]?.id ?? '';
			if (!resolvedDataSourceId) throw new Error('No data source found');
			response = await notion.dataSources.query({ data_source_id: resolvedDataSourceId, page_size: 100 });
		}
		const items = response.results.filter(isFullPage).map(mapPage).filter((item) => item.title !== 'Untitled');
		if (!items.length) {
			return { projects: previewProjects, connected: false, message: '当前 Notion ID 指向 3 条空白记录，请改为截图中“作品集”数据库的 ID。' };
		}
		return { projects: items, connected: true };
	} catch {
		return { projects: previewProjects, connected: false, message: 'Notion 数据库尚未授权给 Astro Website，当前显示预览数据。' };
	}
}

export async function getNotionProjects(): Promise<ProjectFeed> {
	const feed = await getNotionContent();
	const projects = feed.projects.filter((item) => item.type.toLowerCase() === 'project');
	return { ...feed, projects: projects.length || feed.connected ? projects : previewProjects };
}

export async function getNotionArticles(): Promise<ProjectFeed> {
	const feed = await getNotionContent();
	const articleTypes = new Set(['article', 'blog', 'post', 'note', '文章', '博客', '笔记']);
	return { ...feed, projects: feed.projects.filter((item) => articleTypes.has(item.type.toLowerCase())) };
}

export async function getNotionPageContent(pageId: string): Promise<PortfolioBlock[]> {
	const token = import.meta.env.NOTION_TOKEN;
	if (!token || pageId.startsWith('preview-')) return [];
	const notion = new Client({ auth: token, logger: () => undefined });

	async function readChildren(blockId: string): Promise<PortfolioBlock[]> {
		const output: PortfolioBlock[] = [];
		let cursor: string | undefined;
		do {
			const response = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
			for (const item of response.results) {
				if (!isFullBlock(item)) continue;
				let block: PortfolioBlock | undefined;
				switch (item.type) {
					case 'paragraph': block = { id: item.id, type: item.type, text: item.paragraph.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'heading_1': block = { id: item.id, type: item.type, text: item.heading_1.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'heading_2': block = { id: item.id, type: item.type, text: item.heading_2.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'heading_3': block = { id: item.id, type: item.type, text: item.heading_3.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'bulleted_list_item': block = { id: item.id, type: item.type, text: item.bulleted_list_item.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'numbered_list_item': block = { id: item.id, type: item.type, text: item.numbered_list_item.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'to_do': block = { id: item.id, type: item.type, text: item.to_do.rich_text.map((text) => text.plain_text).join(''), checked: item.to_do.checked }; break;
					case 'quote': block = { id: item.id, type: item.type, text: item.quote.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'callout': block = { id: item.id, type: item.type, text: item.callout.rich_text.map((text) => text.plain_text).join('') }; break;
					case 'code': block = { id: item.id, type: item.type, text: item.code.rich_text.map((text) => text.plain_text).join(''), language: item.code.language }; break;
					case 'divider': block = { id: item.id, type: item.type, text: '' }; break;
					case 'image': block = { id: item.id, type: item.type, text: item.image.caption.map((text) => text.plain_text).join(''), url: item.image.type === 'external' ? item.image.external.url : item.image.file.url }; break;
					case 'bookmark': block = { id: item.id, type: item.type, text: item.bookmark.caption.map((text) => text.plain_text).join(''), url: item.bookmark.url }; break;
				}
				if (block && (block.text || block.type === 'divider' || block.url)) output.push(block);
				if (item.has_children) output.push(...await readChildren(item.id));
			}
			cursor = response.next_cursor ?? undefined;
		} while (cursor);
		return output;
	}

	try {
		return await readChildren(pageId);
	} catch {
		return [];
	}
}
