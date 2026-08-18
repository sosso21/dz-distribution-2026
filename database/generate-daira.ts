/**
 * generate-daira.ts
 *
 * Generates `database/daira.ts` from the authoritative source data in
 * `database/wilaya.ts` and `database/commune.ts`.
 *
 * IMPORTANT: This script does NOT attempt to guess or repair incorrect
 * daira assignments. If a commune's `daira` field is wrong in
 * `commune.ts`, that must be fixed at the source. This generator only
 * performs a deterministic transformation:
 *
 *   wilaya.ts + commune.ts  --->  daira.ts
 *
 * Run with ts-node / tsx, e.g.:
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
  commune_name: string; // Arabic name
  commune_name_fr: string; // French/Latin name
  daira_name: string; // Arabic daira name
  daira_name_fr: string; // French/Latin daira name
  wilaya_code: number; // matches Wilaya.id
  wilaya_name: string; // Arabic wilaya name (denormalized copy)
  wilaya_name_fr: string; // French/Latin wilaya name (denormalized copy)
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
 * Some source modules may export a plain array, while others may export an
 * object wrapper that holds the array under a named key (e.g. `{ wilayas: [...] }`).
 * This helper normalizes both shapes into a plain array so the generator
 * does not break if the source file's export shape changes.
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
    `Unable to extract an array from the source module (expected an array or an object containing a "${arrayKey}" array).`,
  );
}

/**
 * Resolves a wilaya's official numeric id. `wilaya.ts` is expected to use
 * an `id` field, but this falls back to `wilaya_code` in case the wilaya
 * schema is ever aligned with the commune schema's naming convention.
 */
function getWilayaId(wilaya: Wilaya): number {
  const raw =
    (wilaya as unknown as Record<string, unknown>).id ??
    (wilaya as unknown as Record<string, unknown>).wilaya_code;
  const id = Number(raw);
  if (!Number.isFinite(id)) {
    throw new Error(
      `Encountered a wilaya with an invalid/missing id: ${JSON.stringify(wilaya)}`,
    );
  }
  return id;
}

/**
 * Resolves whether a wilaya belongs to the "new" administrative division
 * (previously the 2019/2021 split into 10 additional wilayas, referred to
 * here as `new_2025`). Falls back across a couple of plausible field names
 * for resilience against minor schema drift.
 */
function getWilayaNew2025(wilaya: Wilaya): boolean {
  const raw = wilaya as unknown as Record<string, unknown>;
  return Boolean(raw.new_2025 ?? raw.new2025 ?? false);
}

/** Resolves a wilaya's French/Latin display name across possible field names. */
function getWilayaNameFr(wilaya: Wilaya): string {
  const raw = wilaya as unknown as Record<string, unknown>;
  const value = raw.name ?? raw.name_fr ?? raw.wilaya_name_fr;
  return typeof value === "string" ? value : "";
}

/** Resolves a wilaya's Arabic display name across possible field names. */
function getWilayaNameAr(wilaya: Wilaya): string {
  const raw = wilaya as unknown as Record<string, unknown>;
  const value = raw.name_ar ?? raw.wilaya_name;
  return typeof value === "string" ? value : "";
}

/**
 * Normalizes a daira name for use as a grouping key.
 * This prevents accidental duplicates caused by casing, extra
 * whitespace, or unicode normalization differences.
 */
function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Serializes a value as a TypeScript literal (not JSON), preserving
 * unquoted object keys and readable formatting matching the project's
 * existing dataset files.
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
    return `[\n${items}\n${closingIndent}]`;
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
    return `{\n${body}\n${closingIndent}}`;
  }

  throw new Error(
    `Unsupported value type encountered during serialization: ${typeof value}`,
  );
}

// ---------------------------------------------------------------------------
// Main generation logic
// ---------------------------------------------------------------------------

function main(): void {
  const wilayas = extractArray<Wilaya>(wilayaData, "wilayas");
  const communes = extractArray<Commune>(communeData, "communes");

  // ---- Validation 1: wilaya count -----------------------------------------
  if (wilayas.length !== EXPECTED_WILAYA_COUNT) {
    throw new Error(
      `Validation failed: expected ${EXPECTED_WILAYA_COUNT} wilayas, found ${wilayas.length}.`,
    );
  }

  // ---- Validation 2: commune count ----------------------------------------
  if (communes.length !== EXPECTED_COMMUNE_COUNT) {
    throw new Error(
      `Validation failed: expected ${EXPECTED_COMMUNE_COUNT} communes, found ${communes.length}.`,
    );
  }

  // Build a lookup map for wilayas by id, used to resolve wilaya info for
  // each commune and to detect communes referencing a non-existent wilaya.
  const wilayaById = new Map<number, Wilaya>();
  for (const wilaya of wilayas) {
    wilayaById.set(getWilayaId(wilaya), wilaya);
  }

  // ---- Grouping: build dairas from communes -------------------------------
  // Each daira is uniquely identified by `wilaya_id + normalized daira name`.
  const dairaGroups = new Map<
    string,
    {
      name: string;
      name_ar: string;
      wilaya_id: number;
      commune_count: number;
    }
  >();

  for (const commune of communes) {
    const dairaNameFr = commune.daira_name_fr
      ? commune.daira_name_fr.trim()
      : "";
    const dairaNameAr = commune.daira_name ? commune.daira_name.trim() : "";

    // ---- Validation 3: every commune must have a daira --------------------
    // The French/Latin name is treated as the canonical grouping name since
    // it is the one used for the generated dataset's `name` field; the
    // Arabic name must still be present to populate `name_ar`.
    if (!dairaNameFr || !dairaNameAr) {
      throw new Error(
        `Validation failed: commune "${commune.commune_name_fr}" (id: ${commune.id}) has no daira assigned.`,
      );
    }

    // ---- Validation 4: every commune must reference an existing wilaya ----
    const wilaya = wilayaById.get(commune.wilaya_code);
    if (!wilaya) {
      throw new Error(
        `Validation failed: commune "${commune.commune_name_fr}" (id: ${commune.id}) references unknown wilaya_code ${commune.wilaya_code}.`,
      );
    }

    // Soft consistency check (non-fatal): commune.ts carries a denormalized
    // copy of the wilaya's French name. Flag mismatches for data-quality
    // review without aborting generation over what is likely a minor typo.
    const resolvedWilayaNameFr = getWilayaNameFr(wilaya);
    if (
      resolvedWilayaNameFr &&
      normalize(commune.wilaya_name_fr) !== normalize(resolvedWilayaNameFr)
    ) {
      console.warn(
        `Warning: commune "${commune.commune_name_fr}" (id: ${commune.id}) has wilaya_name_fr "${commune.wilaya_name_fr}", but wilaya.ts (id ${commune.wilaya_code}) says "${resolvedWilayaNameFr}".`,
      );
    }

    const normalizedDairaName = normalize(dairaNameFr);
    const key = `${commune.wilaya_code}|${normalizedDairaName}`;

    const existing = dairaGroups.get(key);
    if (existing) {
      existing.commune_count += 1;
    } else {
      dairaGroups.set(key, {
        // Preserve the original (non-normalized) names for display purposes.
        name: dairaNameFr,
        name_ar: dairaNameAr,
        wilaya_id: commune.wilaya_code,
        commune_count: 1,
      });
    }
  }

  // ---- Build the final Daira[] list ----------------------------------------
  // Sorted by wilaya_id then by daira name for a stable, predictable output.
  const sortedGroups = Array.from(dairaGroups.values()).sort((a, b) => {
    if (a.wilaya_id !== b.wilaya_id) {
      return a.wilaya_id - b.wilaya_id;
    }
    return a.name.localeCompare(b.name, "fr");
  });

  const dairas: Daira[] = sortedGroups.map((group, index) => {
    const wilaya = wilayaById.get(group.wilaya_id) as Wilaya;

    return {
      id: index + 1,
      name: group.name,
      name_ar: group.name_ar,

      wilaya_name: getWilayaNameFr(wilaya),
      wilaya_name_ar: getWilayaNameAr(wilaya),
      wilaya_id: getWilayaId(wilaya),

      // The `new_2026` flag mirrors the wilaya's `new_2025` flag: a daira
      // belongs to the "new administrative division" exactly when its
      // parent wilaya does. This value is derived, never manually entered.
      new_2026: getWilayaNew2025(wilaya),

      commune_count: group.commune_count,
    };
  });

  // ---- Validation 5: total commune count must match ------------------------
  const totalCountedCommunes = dairas.reduce(
    (total, daira) => total + daira.commune_count,
    0,
  );

  if (totalCountedCommunes !== EXPECTED_COMMUNE_COUNT) {
    throw new Error(
      `Validation failed: sum of commune_count across all dairas is ${totalCountedCommunes}, expected ${EXPECTED_COMMUNE_COUNT}.`,
    );
  }

  // ---- Assemble the final dataset ------------------------------------------
  const dataset: DairaDataset = {
    country: "Algeria",
    country_ar: "الجزائر",
    total_dairas: dairas.length,
    total_communes: EXPECTED_COMMUNE_COUNT,
    total_wilayas: EXPECTED_WILAYA_COUNT,
    last_updated: DATASET_LAST_UPDATED,
    version: DATASET_VERSION,
    description:
      "All dairas of Algeria with their wilaya information and commune count",
    dairas,
  };

  // ---- Write daira.ts --------------------------------------------------------
  const fileHeader = [
    "/**",
    " * daira.ts",
    " *",
    " * AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.",
    " * This file is generated by `generate-daira.ts` from `wilaya.ts` and `commune.ts`.",
    " * Re-run the generator to update this file after changing the source data.",
    " */",
    "",
  ].join("\n");

  const datasetLiteral = toTsLiteral(dataset, 1);
  const fileBody = `const daira = ${datasetLiteral};\n\nexport default daira;\n`;

  fs.writeFileSync(OUTPUT_FILE, `${fileHeader}${fileBody}`, "utf-8");

  // ---- Summary ---------------------------------------------------------------
  console.log("daira.ts generated successfully.");
  console.log(`  Wilayas processed:   ${wilayas.length}`);
  console.log(`  Communes processed:  ${communes.length}`);
  console.log(`  Dairas generated:    ${dairas.length}`);
  console.log(`  Communes counted:    ${totalCountedCommunes}`);
  console.log(`  Output file:         ${OUTPUT_FILE}`);
}

main();
