import fs from "fs";
import path from "path";

import distric from "./district";
import daira from "./daira";

// ============================================================
// SLUGIFY
// ============================================================

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================
// ANCIENNE VERSION
// district.ts
//
// IMPORTANT :
// La comparaison utilise UNIQUEMENT district.name.fr
// ============================================================

const oldDairas = distric.map((district) => ({
  id: district.id,
  name: district.name.fr,
  slug: slugify(district.name.fr),
}));

// ============================================================
// NOUVELLE VERSION
// daira.ts
//
// IMPORTANT :
// La comparaison utilise UNIQUEMENT daira.name
// ============================================================

const newDairas = daira.dairas.map((daira) => ({
  id: daira.id,
  name: daira.name,
  slug: slugify(daira.name),
  new_2026: daira.new_2026,
  wilaya_name: daira.wilaya_name,
  wilaya_id: daira.wilaya_id,
}));

// ============================================================
// CRÉATION DES MAPS
//
// La clé utilisée pour comparer est UNIQUEMENT le slug du nom
// ============================================================

const oldMap = new Map(oldDairas.map((daira) => [daira.slug, daira]));

const newMap = new Map(newDairas.map((daira) => [daira.slug, daira]));

// ============================================================
// DAÏRAS UNIQUEMENT DANS LA NOUVELLE VERSION
// ============================================================

const onlyInNew = newDairas.filter((daira) => !oldMap.has(daira.slug));

// ============================================================
// DAÏRAS UNIQUEMENT DANS L'ANCIENNE VERSION
// ============================================================

const onlyInOld = oldDairas.filter((daira) => !newMap.has(daira.slug));

// ============================================================
// GÉNÉRATION DU MARKDOWN
// ============================================================

const lines: string[] = [];

lines.push("# Comparaison des daïras");
lines.push("");

lines.push("## Résumé");
lines.push("");

lines.push(`- Ancienne version : **${oldDairas.length} daïras**`);

lines.push(`- Nouvelle version : **${newDairas.length} daïras**`);

lines.push(`- Uniquement dans la nouvelle : **${onlyInNew.length}**`);

lines.push(`- Uniquement dans l'ancienne : **${onlyInOld.length}**`);

lines.push("");

// ============================================================
// 1. NOUVELLE MAIS PAS ANCIENNE
// ============================================================

lines.push(
  "## 1. Daïras présentes dans la nouvelle version mais pas dans l'ancienne",
);

lines.push("");

if (onlyInNew.length === 0) {
  lines.push("Aucune.");
} else {
  onlyInNew.forEach((d, index) => {
    lines.push(`${index + 1}. **${d.name}** — \`${d.slug}\``);
  });
}

lines.push("");

// ============================================================
// 2. ANCIENNE MAIS PAS NOUVELLE
// ============================================================

lines.push(
  "## 2. Daïras présentes dans l'ancienne version mais pas dans la nouvelle",
);

lines.push("");

if (onlyInOld.length === 0) {
  lines.push("Aucune.");
} else {
  onlyInOld.forEach((d, index) => {
    lines.push(`${index + 1}. **${d.name}** — \`${d.slug}\``);
  });
}

lines.push("");

// ============================================================
// ÉCRITURE DU FICHIER MARKDOWN
// ============================================================

const outputPath = path.join(__dirname, "comparaison-daira.md");

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

// ============================================================
// AFFICHAGE TERMINAL
// ============================================================

console.log("");
console.log("=================================");
console.log("COMPARAISON DES DAÏRAS");
console.log("=================================");

console.log(`Ancienne version    : ${oldDairas.length}`);

console.log(`Nouvelle version    : ${newDairas.length}`);

console.log(`Uniquement nouvelle : ${onlyInNew.length}`);

console.log(`Uniquement ancienne : ${onlyInOld.length}`);

// ============================================================
// NOUVELLES
// ============================================================

console.log("");
console.log("=================================");
console.log("DAÏRAS DANS LA NOUVELLE UNIQUEMENT");
console.log("=================================");

if (onlyInNew.length === 0) {
  console.log("Aucune.");
} else {
  onlyInNew.forEach((d, index) => {
    console.log(`${index + 1}. ${d.name} [${d.slug}]`);
  });
}

// ============================================================
// ANCIENNES
// ============================================================

console.log("");
console.log("=================================");
console.log("DAÏRAS DANS L'ANCIENNE UNIQUEMENT");
console.log("=================================");

if (onlyInOld.length === 0) {
  console.log("Aucune.");
} else {
  onlyInOld.forEach((d, index) => {
    console.log(`${index + 1}. ${d.name} [${d.slug}]`);
  });
}

// ============================================================
// FIN
// ============================================================

console.log("");
console.log("=================================");
console.log("FICHIER GÉNÉRÉ");
console.log("=================================");
console.log(outputPath);
