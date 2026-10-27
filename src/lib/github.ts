import { Octokit } from '@octokit/rest';
import type { PortfolioProject } from './types';

export async function getGithubProjects(): Promise<PortfolioProject[]> {
	const owner = import.meta.env.GITHUB_OWNER;
	const token = import.meta.env.GITHUB_TOKEN;
	if (!owner) return [];
	try {
		const github = new Octokit({ auth: token || undefined });
		let response;
		if (token) {
			const authenticated = await github.rest.users.getAuthenticated();
			response = authenticated.data.login.toLowerCase() === owner.toLowerCase()
				? await github.rest.repos.listForAuthenticatedUser({ visibility: 'all', sort: 'updated', per_page: 24 })
				: await github.rest.repos.listForUser({ username: owner, sort: 'updated', per_page: 24 });
		} else {
			response = await github.rest.repos.listForUser({ username: owner, sort: 'updated', per_page: 24 });
		}
		return response.data.filter((repo) => !repo.fork && !repo.archived).map((repo) => ({
			id: String(repo.id), title: repo.name, slug: repo.name.toLowerCase(), summary: repo.description ?? '',
			type: 'Project', featured: false, website: repo.homepage || undefined, github: repo.html_url,
			tags: repo.language ? [repo.language] : [], updatedAt: repo.updated_at ?? undefined, source: 'github',
		}));
	} catch {
		return [];
	}
}
