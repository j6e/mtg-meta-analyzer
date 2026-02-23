import { toPng } from 'html-to-image';

/**
 * Capture a DOM element as a PNG and trigger a download.
 * Optional `captureStyles` are applied to the element before capture and restored after,
 * so that html-to-image computes dimensions from the styled element.
 */
export async function exportElementAsImage(
	element: HTMLElement,
	filename: string,
	captureStyles?: Partial<CSSStyleDeclaration>,
): Promise<void> {
	const saved = new Map<string, string>();

	if (captureStyles) {
		for (const [prop, value] of Object.entries(captureStyles)) {
			saved.set(prop, (element.style as any)[prop] ?? '');
			(element.style as any)[prop] = value;
		}
	}

	try {
		const dataUrl = await toPng(element, { cacheBust: true });
		const link = document.createElement('a');
		link.download = filename;
		link.href = dataUrl;
		link.click();
	} finally {
		for (const [prop, value] of saved) {
			(element.style as any)[prop] = value;
		}
	}
}
