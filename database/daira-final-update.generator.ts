import fs from "fs";
import path from "path";

import distric from "./district.ok-db";
import daira from "./daira";

// ============================================================
// CONFIGURATION
// ============================================================

const MATCH_THRESHOLD = 0.7;
const MAX_MATCHES = 5;

// ============================================================
// TYPES
// ============================================================

type JsonPrimitive = string | number | boolean | null;

type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// ============================================================
// NAME NORMALIZATION
// ============================================================

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// ============================================================
// SLUGIFY
// ============================================================

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================
// LEVENSHTEIN DISTANCE
// ============================================================

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================================
// SIMILARITY SCORE
// ============================================================

function similarity(a: string, b: string): number {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  const distance = levenshtein(normalizedA, normalizedB);

  const maxLength = Math.max(normalizedA.length, normalizedB.length);

  return 1 - distance / maxLength;
}

// ============================================================
// OLD DISTRICTS
// ============================================================

const oldDistricts = distric.map((district) => ({
  id: district.id,
  name: district.name.fr,
  slug: slugify(district.name.fr),
}));

// ============================================================
// FIND POTENTIAL MATCHES
// ============================================================

function findMatches(name: string) {
  return oldDistricts
    .map((district) => ({
      id: district.id,
      name: district.name,
      slug: district.slug,
      score: similarity(name, district.name),
    }))
    .filter((match) => match.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES);
}

// ============================================================
// BUILD ADAPTED DAIRA DATA
// ============================================================

const adaptedDairas = daira.dairas.map((currentDaira) => {
  const matches = findMatches(currentDaira.name);

  const bestMatch = matches[0];

  const equivalentMatches = matches.map((match) => match.name);

  const toVerify =
    equivalentMatches.length > 1 && equivalentMatches[0] !== currentDaira.name;

  return {
    ...currentDaira,

    equivalent_id: bestMatch?.id ?? null,

    equivalent_count: equivalentMatches.length,

    equivalent_matches: equivalentMatches,

    to_verify: toVerify,
  };
});

// ============================================================
// FIND UNMATCHED RECORDS USING IDS
// ============================================================

// All old district IDs referenced by a new daira.

const matchedOldIds = new Set(
  adaptedDairas
    .map((item) => item.equivalent_id)
    .filter((id): id is number => id !== null),
);

// ------------------------------------------------------------
// New dairas without an equivalent old district.
// ------------------------------------------------------------

const onlyInNew = adaptedDairas
  .filter((item) => item.equivalent_id === null)
  .map((item) => ({
    id: item.id,
    name: item.name,
  }));

// ------------------------------------------------------------
// Old districts not referenced by any equivalent_id.
// ------------------------------------------------------------

const onlyInOld = oldDistricts
  .filter((item) => !matchedOldIds.has(item.id))
  .map((item) => ({
    id: item.id,
    name: item.name,
  }));

// ============================================================
// TYPESCRIPT VALUE FORMATTER
// ============================================================

function formatValue(value: JsonValue, indent = 0): string {
  const spacing = " ".repeat(indent);

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const items = value.map(
      (item) => `${" ".repeat(indent + 2)}${formatValue(item, indent + 2)}`,
    );

    return `[
${items.join(",\n")}
${spacing}]`;
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  const properties = entries.map(
    ([key, item]) =>
      `${" ".repeat(indent + 2)}${key}: ${formatValue(item, indent + 2)}`,
  );

  return `{
${properties.join(",\n")}
${spacing}}`;
}

// ============================================================
// GENERATE DAIRA OBJECT WITH COMMENTS
// ============================================================

function generateDairaObject(
  currentDaira: (typeof adaptedDairas)[number],
): string {
  const {
    equivalent_id,
    equivalent_count,
    equivalent_matches,
    to_verify,
    ...dairaData
  } = currentDaira;

  const objectContent = formatValue(
    dairaData as unknown as Record<string, JsonValue>,
    2,
  );

  const lines = objectContent.split("\n");

  // Remove the final closing brace.

  lines.pop();

  lines.push("");

  lines.push(`  // equivalent_id: ${equivalent_id ?? "null"}`);

  lines.push(`  // equivalent_count: ${equivalent_count}`);

  if (equivalent_count > 1) {
    lines.push("  //! equivalent_count > 1");
  }

  lines.push(`  // equivalent_matches: ${JSON.stringify(equivalent_matches)}`);

  lines.push(`  // to_verify: ${to_verify}`);

  lines.push("}");

  return lines.join("\n");
}

// ============================================================
// GENERATE DAIRA OBJECTS
// ============================================================

const dairaObjects = adaptedDairas.map(
  (currentDaira) =>
    `    ${generateDairaObject(currentDaira).split("\n").join("\n    ")}`,
);

// ============================================================
// GENERATE UNMATCHED ARRAYS
// ============================================================

const onlyInNewArray = onlyInNew
  .map(
    (item) =>
      `  {
    id: ${item.id},
    name: ${JSON.stringify(item.name)},
  }`,
  )
  .join(",\n");

const onlyInOldArray = onlyInOld
  .map(
    (item) =>
      `  {
    id: ${item.id},
    name: ${JSON.stringify(item.name)},
  }`,
  )
  .join(",\n");

// ============================================================
// GENERATE TYPESCRIPT FILE
// ============================================================

const fileContent = `/**
 * daira-final-update.ts
 *
 * AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.
 *
 * Generated from:
 * - daira.ts
 * - district.ok-db.ts
 *
 * Matching is based exclusively on the daira name.
 * Wilaya IDs are NOT used for matching.
 *
 * New dairas: ${daira.dairas.length}
 * Old districts: ${oldDistricts.length}
 */

const dairaFinalUpdate = {
  country: ${JSON.stringify(daira.country)},
  country_ar: ${JSON.stringify(daira.country_ar)},
  total_dairas: ${daira.total_dairas},
  total_communes: ${daira.total_communes},
  total_wilayas: ${daira.total_wilayas},
  last_updated: ${JSON.stringify(daira.last_updated)},
  version: ${JSON.stringify(daira.version)},
  description: ${JSON.stringify(daira.description)},

  dairas: [
${dairaObjects.join(",\n")}
  ],
} as const;

export default dairaFinalUpdate;

// ============================================================
// UNMATCHED RECORDS
// ============================================================
//
// These lists are based on equivalent_id and old district IDs.
//
// A new daira is considered unmatched when:
//
//   equivalent_id === null
//
// An old district is considered unmatched when:
//
//   its ID is not referenced by any equivalent_id.
//
// ============================================================
// ONLY IN NEW
// ============================================================
//
// New dairas without an equivalent old district.
//
// [
${onlyInNewArray || "  // None"}
// ]

// ============================================================
// ONLY IN OLD
// ============================================================
//
// Old districts not referenced by any equivalent_id.
//
/*
[
${onlyInOldArray || "  // None"}
]
*/
`;

// ============================================================
// WRITE FILE
// ============================================================

const outputPath = path.join(__dirname, "daira-final-update.ts");

fs.writeFileSync(outputPath, fileContent, "utf8");

// ============================================================
// TERMINAL REPORT
// ============================================================

const noMatchCount = adaptedDairas.filter(
  (item) => item.equivalent_id === null,
).length;

const singleMatchCount = adaptedDairas.filter(
  (item) => item.equivalent_count === 1,
).length;

const multipleMatchCount = adaptedDairas.filter(
  (item) => item.equivalent_count > 1,
).length;

const toVerifyCount = adaptedDairas.filter((item) => item.to_verify).length;

console.log("");
console.log("============================================");
console.log("DAIRA FINAL UPDATE GENERATED");
console.log("============================================");

console.log(`New dairas         : ${daira.dairas.length}`);

console.log(`Old districts      : ${oldDistricts.length}`);

console.log(`Only in new        : ${onlyInNew.length}`);

console.log(`Only in old        : ${onlyInOld.length}`);

console.log(`No equivalent      : ${noMatchCount}`);

console.log(`Single match       : ${singleMatchCount}`);

console.log(`Multiple matches   : ${multipleMatchCount}`);

console.log(`To verify          : ${toVerifyCount}`);

console.log(`Match threshold    : ${MATCH_THRESHOLD}`);

console.log("");

console.log(`Generated file     : ${outputPath}`);

console.log("");

console.log("============================================");
console.log("GENERATION COMPLETED");
console.log("============================================");
