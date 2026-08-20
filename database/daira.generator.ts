/**
 * generate-daira.ts
 *
 * Generates `database/daira.ts` from the authoritative source data in
 * `database/wilaya.ts` and `database/commune.ts`.
 *
 * IMPORTANT: This script does NOT attempt to guess or repair incorrect
 * daira assignments. If a commune's `daira` field is wrong in
 * `commune.ts`, that must be fixed at the source.
 *
 * This generator performs a deterministic transformation:
 *
 *   wilaya.ts + commune.ts  --->  daira.ts
 *
 * The latitude and longitude of each daira are taken from the commune
 * belonging to that daira with the lowest `code_commune`.
 *
 * Run with ts-node / tsx:
 *
 *   npx tsx database/generate-daira.ts
 *   npx ts-node database/generate-daira.ts
 */

import fs from "node:fs";
import path from "node:path";

import wilayaData from "./wilaya";
import communeData from "./commune";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Wilaya {
  id: number;
  name: string;
  name_ar: string;
  established: string;
  latitude: number;
  longitude: number;
  elevation: number;
  region: string;
  area_km2?: number;
  phone_code?: string;
  postal_code?: string;
  population_approx?: number;
  parent_wilaya?: string;
  new_2025?: boolean;
  notable_features?: string[];
  commune_count: number;
}

interface Commune {
  id: string;

  commune_name: string;
  commune_name_fr: string;

  daira_name: string;
  daira_name_fr: string;

  wilaya_code: number;

  wilaya_name: string;
  wilaya_name_fr: string;

  code_commune: number;

  Lat: number;
  Long: number;
}

interface Daira {
  id: number;

  name: string;
  name_ar: string;

  wilaya_name: string;
  wilaya_name_ar: string;
  wilaya_id: number;

  new_2026: boolean;

  commune_count: number;

  latitude: number;
  longitude: number;
}

interface DairaDataset {
  country: string;
  country_ar: string;

  total_dairas: number;
  total_communes: number;
  total_wilayas: number;

  last_updated: string;
  version: string;

  description: string;

  dairas: Daira[];
}

interface DairaGroup {
  name: string;
  name_ar: string;

  wilaya_id: number;

  commune_count: number;

  /**
   * Commune with the lowest code_commune.
   * Its coordinates become the coordinates of the daira.
   */
  reference_commune_code: number;

  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_WILAYA_COUNT = 69;
const EXPECTED_COMMUNE_COUNT = 1541;

const DATASET_VERSION = "2.0.0";
const DATASET_LAST_UPDATED = "2026-07-31";

const OUTPUT_FILE = path.join(__dirname, "daira.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts an array from either:
 *
 *   export default [...]
 *
 * or:
 *
 *   export default {
 *     communes: [...]
 *   }
 */
function extractArray<T>(input: unknown, arrayKey: string): T[] {
  if (Array.isArray(input)) {
    return input as T[];
  }

  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as Record<string, unknown>)[arrayKey])
  ) {
    return (input as Record<string, unknown>)[arrayKey] as T[];
  }

  throw new Error(
    `Unable to extract an array from the source module. Expected an array or an object containing "${arrayKey}".`,
  );
}

/**
 * Resolves the official numeric wilaya ID.
 */
function getWilayaId(wilaya: Wilaya): number {
  const raw =
    (wilaya as unknown as Record<string, unknown>).id ??
    (wilaya as unknown as Record<string, unknown>).wilaya_code;

  const id = Number(raw);

  if (!Number.isFinite(id)) {
    throw new Error(
      `Encountered a wilaya with an invalid or missing ID: ${JSON.stringify(
        wilaya,
      )}`,
    );
  }

  return id;
}

/**
 * Resolves whether the wilaya belongs to the new administrative division.
 */
function getWilayaNew2025(wilaya: Wilaya): boolean {
  const raw = wilaya as unknown as Record<string, unknown>;

  return Boolean(raw.new_2025 ?? raw.new2025 ?? false);
}

/**
 * Resolves the French / Latin wilaya name.
 */
function getWilayaNameFr(wilaya: Wilaya): string {
  const raw = wilaya as unknown as Record<string, unknown>;

  const value = raw.name ?? raw.name_fr ?? raw.wilaya_name_fr;

  return typeof value === "string" ? value : "";
}

/**
 * Resolves the Arabic wilaya name.
 */
function getWilayaNameAr(wilaya: Wilaya): string {
  const raw = wilaya as unknown as Record<string, unknown>;

  const value = raw.name_ar ?? raw.wilaya_name;

  return typeof value === "string" ? value : "";
}

/**
 * Normalizes a daira name for grouping.
 */
function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Serializes a value as a readable TypeScript literal.
 */
function toTsLiteral(value: unknown, indentLevel: number): string {
  const indent = "  ".repeat(indentLevel);

  const closingIndent = "  ".repeat(Math.max(indentLevel - 1, 0));

  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const items = value
      .map((item) => `${indent}${toTsLiteral(item, indentLevel + 1)}`)
      .join(",\n");

    return `[
${items}
${closingIndent}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return "{}";
    }

    const body = entries
      .map(
        ([key, val]) => `${indent}${key}: ${toTsLiteral(val, indentLevel + 1)}`,
      )
      .join(",\n");

    return `{
${body}
${closingIndent}}`;
  }

  throw new Error(
    `Unsupported value type encountered during serialization: ${typeof value}`,
  );
}

// ---------------------------------------------------------------------------
// Main generation logic
// ---------------------------------------------------------------------------

function main(): void {
  // -------------------------------------------------------------------------
  // Extract source data
  // -------------------------------------------------------------------------

  const wilayas = extractArray<Wilaya>(wilayaData, "wilayas");

  const communes = extractArray<Commune>(communeData, "communes");

  // -------------------------------------------------------------------------
  // Validation 1: Wilaya count
  // -------------------------------------------------------------------------

  if (wilayas.length !== EXPECTED_WILAYA_COUNT) {
    throw new Error(
      `Validation failed: expected ${EXPECTED_WILAYA_COUNT} wilayas, found ${wilayas.length}.`,
    );
  }

  // -------------------------------------------------------------------------
  // Validation 2: Commune count
  // -------------------------------------------------------------------------

  if (communes.length !== EXPECTED_COMMUNE_COUNT) {
    throw new Error(
      `Validation failed: expected ${EXPECTED_COMMUNE_COUNT} communes, found ${communes.length}.`,
    );
  }

  // -------------------------------------------------------------------------
  // Build wilaya lookup
  // -------------------------------------------------------------------------

  const wilayaById = new Map<number, Wilaya>();

  for (const wilaya of wilayas) {
    wilayaById.set(getWilayaId(wilaya), wilaya);
  }

  // -------------------------------------------------------------------------
  // Group communes into dairas
  // -------------------------------------------------------------------------

  const dairaGroups = new Map<string, DairaGroup>();

  for (const commune of communes) {
    const dairaNameFr = commune.daira_name_fr
      ? commune.daira_name_fr.trim()
      : "";

    const dairaNameAr = commune.daira_name ? commune.daira_name.trim() : "";

    // -----------------------------------------------------------------------
    // Validation 3: Every commune must have a daira
    // -----------------------------------------------------------------------

    if (!dairaNameFr || !dairaNameAr) {
      throw new Error(
        `Validation failed: commune "${commune.commune_name_fr}" (id: ${commune.id}) has no daira assigned.`,
      );
    }

    // -----------------------------------------------------------------------
    // Validation 4: Commune must reference an existing wilaya
    // -----------------------------------------------------------------------

    const wilaya = wilayaById.get(commune.wilaya_code);

    if (!wilaya) {
      throw new Error(
        `Validation failed: commune "${commune.commune_name_fr}" (id: ${commune.id}) references unknown wilaya_code ${commune.wilaya_code}.`,
      );
    }

    // -----------------------------------------------------------------------
    // Soft consistency check
    // -----------------------------------------------------------------------

    const resolvedWilayaNameFr = getWilayaNameFr(wilaya);

    if (
      resolvedWilayaNameFr &&
      normalize(commune.wilaya_name_fr) !== normalize(resolvedWilayaNameFr)
    ) {
      console.warn(
        `Warning: commune "${commune.commune_name_fr}" (id: ${commune.id}) has wilaya_name_fr "${commune.wilaya_name_fr}", but wilaya.ts (id ${commune.wilaya_code}) says "${resolvedWilayaNameFr}".`,
      );
    }

    // -----------------------------------------------------------------------
    // Create grouping key
    // -----------------------------------------------------------------------

    const normalizedDairaName = normalize(dairaNameFr);

    const key = `${commune.wilaya_code}|${normalizedDairaName}`;

    const existing = dairaGroups.get(key);

    // -----------------------------------------------------------------------
    // Existing daira
    // -----------------------------------------------------------------------

    if (existing) {
      existing.commune_count += 1;

      /**
       * The commune with the lowest code_commune becomes
       * the reference commune for the daira coordinates.
       */
      if (commune.code_commune < existing.reference_commune_code) {
        existing.reference_commune_code = commune.code_commune;

        existing.latitude = commune.Lat;

        existing.longitude = commune.Long;
      }

      continue;
    }

    // -----------------------------------------------------------------------
    // New daira
    // -----------------------------------------------------------------------

    dairaGroups.set(key, {
      name: dairaNameFr,
      name_ar: dairaNameAr,

      wilaya_id: commune.wilaya_code,

      commune_count: 1,

      /**
       * First commune becomes the temporary reference.
       * If another commune has a lower code_commune,
       * it will replace these coordinates.
       */
      reference_commune_code: commune.code_commune,

      latitude: commune.Lat,

      longitude: commune.Long,
    });
  }

  // -------------------------------------------------------------------------
  // Sort dairas
  // -------------------------------------------------------------------------

  const sortedGroups = Array.from(dairaGroups.values()).sort((a, b) => {
    if (a.wilaya_id !== b.wilaya_id) {
      return a.wilaya_id - b.wilaya_id;
    }

    return a.name.localeCompare(b.name, "fr");
  });

  // -------------------------------------------------------------------------
  // Build final Daira[]
  // -------------------------------------------------------------------------

  const dairas: Daira[] = sortedGroups.map((group, index) => {
    const wilaya = wilayaById.get(group.wilaya_id) as Wilaya;

    return {
      id: index + 1,

      name: group.name,
      name_ar: group.name_ar,

      wilaya_name: getWilayaNameFr(wilaya),

      wilaya_name_ar: getWilayaNameAr(wilaya),

      wilaya_id: getWilayaId(wilaya),

      new_2026: getWilayaNew2025(wilaya),

      commune_count: group.commune_count,

      /**
       * Coordinates come from the commune belonging
       * to this daira with the lowest code_commune.
       */
      latitude: group.latitude,

      longitude: group.longitude,
    };
  });

  // -------------------------------------------------------------------------
  // Validation 5: Commune total
  // -------------------------------------------------------------------------

  const totalCountedCommunes = dairas.reduce(
    (total, currentDaira) => total + currentDaira.commune_count,
    0,
  );

  if (totalCountedCommunes !== EXPECTED_COMMUNE_COUNT) {
    throw new Error(
      `Validation failed: sum of commune_count across all dairas is ${totalCountedCommunes}, expected ${EXPECTED_COMMUNE_COUNT}.`,
    );
  }

  // -------------------------------------------------------------------------
  // Validation 6: Coordinate validation
  // -------------------------------------------------------------------------

  const invalidCoordinates = dairas.filter(
    (currentDaira) =>
      !Number.isFinite(currentDaira.latitude) ||
      !Number.isFinite(currentDaira.longitude),
  );

  if (invalidCoordinates.length > 0) {
    throw new Error(
      `Validation failed: ${invalidCoordinates.length} dairas have invalid coordinates.`,
    );
  }

  // -------------------------------------------------------------------------
  // Assemble final dataset
  // -------------------------------------------------------------------------

  const dataset: DairaDataset = {
    country: "Algeria",

    country_ar: "الجزائر",

    total_dairas: dairas.length,

    total_communes: EXPECTED_COMMUNE_COUNT,

    total_wilayas: EXPECTED_WILAYA_COUNT,

    last_updated: DATASET_LAST_UPDATED,

    version: DATASET_VERSION,

    description:
      "All dairas of Algeria with their wilaya information, commune count, and coordinates derived from the commune with the lowest code_commune in each daira.",

    dairas,
  };

  // -------------------------------------------------------------------------
  // File header
  // -------------------------------------------------------------------------

  const fileHeader = [
    "/**",
    " * daira.ts",
    " *",
    " * AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.",
    " *",
    " * This file is generated by `generate-daira.ts` from:",
    " * - wilaya.ts",
    " * - commune.ts",
    " *",
    " * Each daira's coordinates are taken from the commune belonging",
    " * to that daira with the lowest `code_commune` value.",
    " *",
    " * Re-run the generator after changing the source data.",
    " */",
    "",
  ].join("\n");

  // -------------------------------------------------------------------------
  // Generate TypeScript output
  // -------------------------------------------------------------------------

  const datasetLiteral = toTsLiteral(dataset, 1);

  const fileBody =
    `const daira = ${datasetLiteral};\n\n` + "export default daira;\n";

  // -------------------------------------------------------------------------
  // Write file
  // -------------------------------------------------------------------------

  fs.writeFileSync(OUTPUT_FILE, `${fileHeader}${fileBody}`, "utf-8");

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log("daira.ts generated successfully.");

  console.log(`  Wilayas processed:   ${wilayas.length}`);

  console.log(`  Communes processed:  ${communes.length}`);

  console.log(`  Dairas generated:    ${dairas.length}`);

  console.log(`  Communes counted:    ${totalCountedCommunes}`);

  console.log(`  Coordinates added:   ${dairas.length}`);

  console.log(`  Output file:         ${OUTPUT_FILE}`);
}

main();
