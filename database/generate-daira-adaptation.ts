import fs from "fs";
import path from "path";

import distric from "./district";
import daira from "./daira";

// ============================================================
// CONFIGURATION
// ============================================================

const MATCH_THRESHOLD = 0.7;
const MAX_MATCHES = 5;

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
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
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
// GENERATE TYPESCRIPT FILE
// ============================================================

const fileContent = `/**
 * daira_with_adaptation.ts
 *
 * AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.
 *
 * Generated from:
 * - daira.ts
 * - district.ts
 *
 * Matching is based exclusively on the daira name.
 * Wilaya IDs are not used for matching.
 */

const dairaWithAdaptation = ${JSON.stringify(
  {
    ...daira,
    dairas: adaptedDairas,
  },
  null,
  2,
)} as const;

export default dairaWithAdaptation;
`;

// ============================================================
// WRITE FILE
// ============================================================

const outputPath = path.join(__dirname, "daira_with_adaptation.ts");

fs.writeFileSync(outputPath, fileContent, "utf8");

// ============================================================
// TERMINAL REPORT
// ============================================================

const noMatchCount = adaptedDairas.filter(
  (daira) => daira.equivalent_count === 0,
).length;

const singleMatchCount = adaptedDairas.filter(
  (daira) => daira.equivalent_count === 1,
).length;

const multipleMatchCount = adaptedDairas.filter(
  (daira) => daira.equivalent_count > 1,
).length;

const toVerifyCount = adaptedDairas.filter((daira) => daira.to_verify).length;

console.log("");
console.log("============================================");
console.log("DAIRA ADAPTATION GENERATED");
console.log("============================================");

console.log(`Total dairas       : ${adaptedDairas.length}`);

console.log(`No match           : ${noMatchCount}`);

console.log(`Single match       : ${singleMatchCount}`);

console.log(`Multiple matches   : ${multipleMatchCount}`);

console.log(`To verify          : ${toVerifyCount}`);

console.log(`Match threshold    : ${MATCH_THRESHOLD}`);

console.log("");
console.log(`Generated file     : ${outputPath}`);

console.log("");
console.log("============================================");
console.log("POTENTIAL MATCHES");
console.log("============================================");

for (const currentDaira of adaptedDairas) {
  console.log("");

  console.log(
    `${currentDaira.name} -> ${currentDaira.equivalent_id ?? "NO MATCH"}`,
  );

  console.log(`  To verify: ${currentDaira.to_verify}`);

  if (currentDaira.equivalent_matches.length > 0) {
    console.log(`  Matches: ${currentDaira.equivalent_matches.join(" | ")}`);
  } else {
    console.log("  Matches: none");
  }
}
