export type Stage = { n: number; title: string; blurb: string };

export const STAGES: readonly Stage[] = [
	{ n: 1, title: 'Foundations', blurb: 'The store, the CLI, and a dev shell you use every day.' },
	{ n: 2, title: 'The language', blurb: 'A small lazy functional language. Learn all of it.' },
	{
		n: 3,
		title: 'Flakes',
		blurb: 'Inputs, lock files, and the output schema every command reads.',
	},
	{
		n: 4,
		title: 'Derivations and packaging',
		blurb: 'What a build actually is, and how to bend nixpkgs.',
	},
	{
		n: 5,
		title: 'Home Manager and modules',
		blurb: 'The module system, then your dotfiles declared in it.',
	},
	{
		n: 6,
		title: 'NixOS and deployment',
		blurb: 'A whole machine from one repo, on a VM, a laptop, a VPS.',
	},
];

export function stageOf(n: number): Stage {
	return STAGES.find((s) => s.n === n) ?? STAGES[0];
}
