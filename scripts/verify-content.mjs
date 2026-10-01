// One runnable check for all lesson content: frontmatter, headings, quiz JSON,
// internal links, and every ```nix block parsed by the real Nix parser.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LESSONS_DIR = 'src/content/lessons';
const REFERENCE_DIR = 'src/content/reference';
const REQUIRED_HEADINGS = [
	'## Why this matters',
	'## Concept',
	'## Try it',
	'## Exercise',
	'## Trap',
	'## Checkpoint',
];
const QUIZ_LENGTH = 3;
const OPTION_COUNT = 4;

const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);
const tmp = mkdtempSync(join(tmpdir(), 'learnnix-verify-'));

function frontmatter(raw, file) {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
	if (!match) {
		fail(file, 'missing frontmatter');
		return { data: {}, body: raw };
	}
	const data = Object.fromEntries(
		match[1]
			.split('\n')
			.filter((l) => l.includes(':'))
			.map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
	);
	return { data, body: raw.slice(match[0].length) };
}

let nixBlocks = 0;
function checkNixBlocks(body, file) {
	const blocks = [...body.matchAll(/```nix\n([\s\S]*?)```/g)].map((m) => m[1]);
	blocks.forEach((code, i) => {
		nixBlocks++;
		const path = join(tmp, `${file.replace(/[^a-z0-9]/gi, '_')}_${i}.nix`);
		writeFileSync(path, code);
		try {
			execFileSync('nix-instantiate', ['--parse', path], { stdio: ['ignore', 'ignore', 'pipe'] });
		} catch (err) {
			const msg = String(err.stderr ?? err.message)
				.split('\n')
				.slice(0, 3)
				.join(' ');
			fail(file, `nix block ${i + 1} does not parse: ${msg}`);
		}
	});
}

function checkQuiz(body, file) {
	const matches = [...body.matchAll(/```quiz\n([\s\S]*?)```/g)];
	if (matches.length !== 1) return fail(file, `expected 1 quiz block, found ${matches.length}`);
	let quiz;
	try {
		quiz = JSON.parse(matches[0][1]);
	} catch (err) {
		return fail(file, `quiz is not valid JSON: ${err.message}`);
	}
	if (!Array.isArray(quiz) || quiz.length !== QUIZ_LENGTH)
		return fail(file, `quiz must have ${QUIZ_LENGTH} questions`);
	quiz.forEach((q, i) => {
		if (typeof q.q !== 'string' || typeof q.why !== 'string')
			fail(file, `quiz ${i + 1}: q/why must be strings`);
		if (!Array.isArray(q.options) || q.options.length !== OPTION_COUNT)
			fail(file, `quiz ${i + 1}: needs ${OPTION_COUNT} options`);
		if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= OPTION_COUNT)
			fail(file, `quiz ${i + 1}: answer out of range`);
	});
}

const lessonFiles = readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.md'));
const referenceFiles = readdirSync(REFERENCE_DIR).filter((f) => f.endsWith('.md'));
const lessonSlugs = new Set();
const orders = new Set();

for (const file of lessonFiles) {
	const raw = readFileSync(join(LESSONS_DIR, file), 'utf8');
	const { data, body } = frontmatter(raw, file);
	for (const key of ['title', 'stage', 'order', 'slug', 'summary', 'minutes']) {
		if (!data[key]) fail(file, `frontmatter missing ${key}`);
	}
	if (data.slug && `${data.slug}.md` !== file)
		fail(file, `slug "${data.slug}" does not match filename`);
	if (lessonSlugs.has(data.slug)) fail(file, 'duplicate slug');
	if (orders.has(data.order)) fail(file, `duplicate order ${data.order}`);
	lessonSlugs.add(data.slug);
	orders.add(data.order);
	if (Number(data.stage) < 1 || Number(data.stage) > 6)
		fail(file, `stage ${data.stage} out of range`);
	if (data.summary && data.summary.length > 140)
		fail(file, `summary too long (${data.summary.length} chars)`);

	let lastIndex = -1;
	for (const heading of REQUIRED_HEADINGS) {
		const idx = body.indexOf(`\n${heading}\n`);
		if (idx === -1) fail(file, `missing heading "${heading}"`);
		else if (idx < lastIndex) fail(file, `heading "${heading}" out of order`);
		lastIndex = Math.max(lastIndex, idx);
	}
	if (!body.includes('<details>') || !body.includes('<summary>Solution</summary>'))
		fail(file, 'exercise solution not in <details>');
	checkNixBlocks(body, file);
	checkQuiz(body, file);
}

const referenceSlugs = new Set(referenceFiles.map((f) => f.replace(/\.md$/, '')));
for (const file of referenceFiles) {
	const raw = readFileSync(join(REFERENCE_DIR, file), 'utf8');
	const { data, body } = frontmatter(raw, file);
	for (const key of ['title', 'order', 'summary'])
		if (!data[key]) fail(file, `frontmatter missing ${key}`);
	checkNixBlocks(body, file);
}

for (const [dir, files] of [
	[LESSONS_DIR, lessonFiles],
	[REFERENCE_DIR, referenceFiles],
]) {
	for (const file of files) {
		const raw = readFileSync(join(dir, file), 'utf8');
		for (const [, kind, slug] of raw.matchAll(
			/\]\(\/(learn|reference)\/([a-z0-9-]+)(?:#[^)]*)?\)/g,
		)) {
			const known = kind === 'learn' ? lessonSlugs : referenceSlugs;
			if (!known.has(slug)) fail(file, `broken link /${kind}/${slug}`);
		}
	}
}

console.log(
	`${lessonFiles.length} lessons, ${referenceFiles.length} reference pages, ${nixBlocks} nix blocks parsed`,
);
if (failures.length) {
	console.error(`\n${failures.length} problem(s):`);
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
console.log('content ok');
