import { describe, expect, it } from "vitest";
import {
	isCardImageIndexCurrent,
	isValidCardImageStatus,
} from "../../scripts/lib/card-image-index";

const status = {
	schemaVersion: 1,
	bulkDataUpdatedAt: "2026-07-13T00:00:00Z",
	unresolved: ["Unknown Card"],
};

describe("card image index preflight", () => {
	it("accepts names covered by resolved entries", () => {
		expect(
			isCardImageIndexCurrent({
				neededNames: ["Lightning Bolt"],
				resolvedNames: ["Lightning Bolt"],
				status,
				currentBulkDataUpdatedAt: status.bulkDataUpdatedAt,
			}),
		).toBe(true);
	});

	it("accepts names recorded as known unresolved", () => {
		expect(
			isCardImageIndexCurrent({
				neededNames: ["Unknown Card"],
				resolvedNames: [],
				status,
				currentBulkDataUpdatedAt: status.bulkDataUpdatedAt,
			}),
		).toBe(true);
	});

	it("rejects newly uncovered names", () => {
		expect(
			isCardImageIndexCurrent({
				neededNames: ["Lightning Bolt", "New Card"],
				resolvedNames: ["Lightning Bolt"],
				status,
				currentBulkDataUpdatedAt: status.bulkDataUpdatedAt,
			}),
		).toBe(false);
	});

	it("rejects a changed bulk-data version", () => {
		expect(
			isCardImageIndexCurrent({
				neededNames: ["Unknown Card"],
				resolvedNames: [],
				status,
				currentBulkDataUpdatedAt: "2026-07-14T00:00:00Z",
			}),
		).toBe(false);
	});

	it("rejects status metadata that overlaps resolved entries", () => {
		expect(
			isCardImageIndexCurrent({
				neededNames: ["Unknown Card"],
				resolvedNames: ["Unknown Card"],
				status,
				currentBulkDataUpdatedAt: status.bulkDataUpdatedAt,
			}),
		).toBe(false);
	});

	it("rejects a status file with an invalid shape", () => {
		expect(isValidCardImageStatus({ ...status, unresolved: "Unknown Card" })).toBe(
			false,
		);
		expect(isValidCardImageStatus({ ...status, schemaVersion: 2 })).toBe(false);
	});
});
