import { Marked } from 'marked';
import { createHighlighter } from 'shiki';
import type { Lesson, LessonMeta, Quiz, Reference, ReferenceMeta } from './types';

// Vite returns unknown for glob imports; with `?raw` + import:'default' every value is a string.
const lessonFiles = import.meta.glob('/src/content/lessons/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;
const referenceFiles = import.meta.glob('/src/content/reference/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const LANG_ALIASES: Record<string, string> = {
	sh: 'shellscript',
	bash: 'shellscript',
	shell: 'shellscript',
	console: 'shellscript',
	zsh: 'shellscript',
};

const highlighter = await createHighlighter({
	themes: ['github-light', 'github-dark'],
	langs: ['nix', 'shellscript', 'fish', 'json', 'toml', 'yaml', 'ini', 'diff', 'lua', 'python'],
});
const loadedLangs = new Set(highlighter.getLoadedLanguages());

function resolveLang(lang: string | undefined): string {
	if (!lang) return 'text';
	const resolved = LANG_ALIASES[lang] ?? lang;
	return loadedLangs.has(resolved) ? resolved : 'text';
}

function slugify(text: string): string {
	return text
		.replace(/<[^>]+>/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

const marked = new Marked({
	renderer: {
		code({ text, lang }) {
			if (lang === 'quiz') return '';
			return highlighter.codeToHtml(text, {
				lang: resolveLang(lang),
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: false,
			});
		},
		heading({ tokens, depth }) {
			const inner = this.parser.parseInline(tokens);
			return `<h${depth} id="${slugify(inner)}">${inner}</h${depth}>\n`;
		},
	},
});

function parseFrontmatter(
	raw: string,
	file: string,
): { data: Record<string, string>; body: string } {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
	if (!match) throw new Error(`${file}: missing frontmatter`);
	const data: Record<string, string> = {};
	for (const line of match[1].split('\n')) {
		const i = line.indexOf(':');
		if (i === -1) continue;
		data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
	}
	return { data, body: raw.slice(match[0].length) };
}

function extractQuiz(body: string): Quiz[] {
	const match = /```quiz\n([\s\S]*?)```/.exec(body);
	if (!match) return [];
	// Shape is enforced at build time by scripts/verify-content.mjs.
	return JSON.parse(match[1]) as Quiz[];
}

function render(body: string): string {
	return marked.parse(body, { async: false });
}

const lessonsFull: Lesson[] = Object.entries(lessonFiles)
	.map(([file, raw]) => {
		const { data, body } = parseFrontmatter(raw, file);
		return {
			slug: data.slug,
			title: data.title,
			stage: Number(data.stage),
			order: Number(data.order),
			summary: data.summary,
			minutes: Number(data.minutes),
			html: render(body),
			quiz: extractQuiz(body),
		};
	})
	.sort((a, b) => a.order - b.order);

const referencesFull: Reference[] = Object.entries(referenceFiles)
	.map(([file, raw]) => {
		const { data, body } = parseFrontmatter(raw, file);
		const slug = file.replace(/^.*\//, '').replace(/\.md$/, '');
		return {
			slug,
			title: data.title,
			order: Number(data.order),
			summary: data.summary,
			html: render(body),
		};
	})
	.sort((a, b) => a.order - b.order);

export const lessons: LessonMeta[] = lessonsFull.map(({ html: _h, quiz: _q, ...meta }) => meta);
export const references: ReferenceMeta[] = referencesFull.map(({ html: _h, ...meta }) => meta);

export function getLesson(slug: string): Lesson | undefined {
	return lessonsFull.find((l) => l.slug === slug);
}

export function getReference(slug: string): Reference | undefined {
	return referencesFull.find((r) => r.slug === slug);
}
