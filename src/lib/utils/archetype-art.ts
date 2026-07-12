/**
 * Card art for the metagame charts (scatter + evolution): loads archetype
 * art crops with dominant-color extraction and exposes them as a Chart.js
 * plugin, plus the Scryfall-mandated artist credit for chart tooltips.
 */

import type { Chart } from "chart.js";
import { get } from "svelte/store";
import {
	cardImageIndex,
	ensureCardImagesLoaded,
	lookupCardImage,
} from "../stores/card-images";

/** Extract the dominant color from an image by sampling a center crop. */
function extractDominantColor(img: HTMLImageElement): string {
	const size = 32;
	const offscreen = document.createElement("canvas");
	offscreen.width = size;
	offscreen.height = size;
	const ctx = offscreen.getContext("2d");
	if (!ctx) return "#888888";
	const imgW = img.naturalWidth;
	const imgH = img.naturalHeight;
	const cropSize = Math.min(imgW, imgH);
	const sx = (imgW - cropSize) / 2;
	const sy = (imgH - cropSize) / 2;
	ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
	const data = ctx.getImageData(0, 0, size, size).data;
	let rSum = 0;
	let gSum = 0;
	let bSum = 0;
	let count = 0;
	for (let i = 0; i < data.length; i += 4) {
		rSum += data[i];
		gSum += data[i + 1];
		bSum += data[i + 2];
		count++;
	}
	return `rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`;
}

/**
 * Card art for chart points, keyed by archetype name (the dataset `label`).
 *
 * `load` resolves each archetype's signature card against the image index
 * and CORS-loads its art crop (CORS is needed for color extraction via
 * getImageData); on failure the point just keeps its colored fill.
 * `onImageLoad` fires per loaded image so the chart can repaint.
 *
 * `plugin` draws the circular-cropped art over each point with a ring in
 * the art's dominant color (`ringWidth` px). `tooltipFooter` credits the
 * hovered archetype's artist (Scryfall imagery guideline for art crops).
 */
export function createArchetypeArtLoader(
	getCardName: (archetypeName: string) => string | undefined,
	onImageLoad: () => void,
	ringWidth = 2,
) {
	const images = new Map<string, HTMLImageElement>();
	const dominantColors = new Map<string, string>();

	async function load(archetypeNames: string[]): Promise<void> {
		await ensureCardImagesLoaded();
		const index = get(cardImageIndex);
		for (const name of archetypeNames) {
			if (images.has(name)) continue;
			const entry = lookupCardImage(index, getCardName(name));
			if (!entry?.art_crop) continue;
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				images.set(name, img);
				dominantColors.set(name, extractDominantColor(img));
				onImageLoad();
			};
			img.src = entry.art_crop;
		}
	}

	const plugin = {
		id: "archetypeArt",
		afterDatasetsDraw(chart: Chart) {
			const ctx = chart.ctx;
			for (let dsIndex = 0; dsIndex < chart.data.datasets.length; dsIndex++) {
				const archName = chart.data.datasets[dsIndex].label;
				if (!archName) continue;
				const img = images.get(archName);
				if (!img) continue;
				const meta = chart.getDatasetMeta(dsIndex);
				for (const rawElement of meta.data) {
					const element = rawElement as unknown as {
						x: number;
						y: number;
						options?: { pointRadius?: number; radius?: number };
					};
					const r = element.options?.pointRadius ?? element.options?.radius ?? 0;
					if (r <= 0) continue; // hidden / 0%-share points
					const { x, y } = element;
					ctx.save();
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.closePath();
					ctx.clip();
					// art_crop is landscape (626×457) — draw a centered square crop
					const imgW = img.naturalWidth;
					const imgH = img.naturalHeight;
					const cropSize = Math.min(imgW, imgH);
					ctx.drawImage(
						img,
						(imgW - cropSize) / 2,
						(imgH - cropSize) / 2,
						cropSize,
						cropSize,
						x - r,
						y - r,
						r * 2,
						r * 2,
					);
					ctx.restore();
					ctx.save();
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.strokeStyle = dominantColors.get(archName) ?? "rgba(255,255,255,0.6)";
					ctx.lineWidth = ringWidth;
					ctx.stroke();
					ctx.restore();
				}
			}
		},
	};

	function tooltipFooter(items: Array<{ dataset: { label?: string } }>): string {
		const archName = items[0]?.dataset?.label;
		const cardName = archName ? getCardName(archName) : undefined;
		const artist = lookupCardImage(get(cardImageIndex), cardName)?.artist;
		return artist ? `Art: ${artist} © Wizards of the Coast` : "";
	}

	return { load, plugin, tooltipFooter };
}
