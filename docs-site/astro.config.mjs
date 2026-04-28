// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.dispatcher.app',
	integrations: [
		starlight({
			title: 'Dispatcher Docs',
			description: 'Documentation for Dispatcher — the AI-powered OneSchool admin assistant for Queensland teachers.',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ospa-au/dispatcher' },
			],
			editLink: {
				baseUrl: 'https://github.com/ospa-au/dispatcher/edit/main/docs-site/',
			},
			lastUpdated: true,
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ label: 'Quick install', slug: 'getting-started/install' },
						{ label: 'First workflow', slug: 'getting-started/first-workflow' },
					],
				},
				{
					label: 'Workflows',
					items: [
						{ label: 'Supervision scheduling', slug: 'workflows/supervision' },
						{ label: 'Relief allocation', slug: 'workflows/relief' },
						{ label: 'Clash detection', slug: 'workflows/clash-detection' },
					],
				},
				{
					label: 'Admin & IT',
					items: [
						{ label: 'Chrome managed install', slug: 'admin/managed-install' },
						{ label: 'Network requirements', slug: 'admin/network-requirements' },
						{ label: 'Data handling', slug: 'admin/data-handling' },
					],
				},
				{
					label: 'Trust & security',
					items: [
						{ label: 'Security overview', slug: 'security/overview' },
						{ label: 'Privacy & data retention', slug: 'security/privacy' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'FAQ', slug: 'reference/faq' },
						{ label: 'Changelog', slug: 'reference/changelog' },
						{ label: 'Support', slug: 'reference/support' },
					],
				},
			],
			customCss: ['./src/styles/custom.css'],
		}),
	],
});
