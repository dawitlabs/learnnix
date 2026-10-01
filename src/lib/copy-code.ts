import type { Attachment } from 'svelte/attachments';

const RESET_MS = 1500;

export const copyCode: Attachment<HTMLElement> = (root) => {
	const buttons: HTMLButtonElement[] = [];
	for (const pre of root.querySelectorAll('pre')) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'copy-btn';
		button.textContent = 'copy';
		button.setAttribute('aria-label', 'Copy code');
		button.addEventListener('click', async () => {
			await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? '');
			button.textContent = 'copied';
			button.dataset.copied = '';
			setTimeout(() => {
				button.textContent = 'copy';
				delete button.dataset.copied;
			}, RESET_MS);
		});
		pre.appendChild(button);
		buttons.push(button);
	}
	return () => {
		for (const b of buttons) b.remove();
	};
};
