export type ProjectSource = 'notion' | 'github' | 'preview';

export interface PortfolioProject {
	id: string;
	title: string;
	slug: string;
	summary: string;
	type: string;
	featured: boolean;
	status?: string;
	website?: string;
	github?: string;
	notionUrl?: string;
	cover?: string;
	tags: string[];
	updatedAt?: string;
	source: ProjectSource;
}

export interface ProjectFeed {
	projects: PortfolioProject[];
	connected: boolean;
	message?: string;
}

export interface PortfolioBlock {
	id: string;
	type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do' | 'quote' | 'callout' | 'code' | 'divider' | 'image' | 'bookmark';
	text: string;
	checked?: boolean;
	language?: string;
	url?: string;
}
