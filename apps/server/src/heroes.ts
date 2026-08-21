import legacyHeroes from "../../../public/database/herolist.json";
import type { Hero } from "@shayyz/contracts";

function slug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const heroes: Hero[] = legacyHeroes
  .map(({ name }) => ({ id: slug(name), name }))
  .filter(
    (hero, index, list) =>
      list.findIndex((candidate) => candidate.id === hero.id) === index,
  )
  .sort((left, right) => left.name.localeCompare(right.name));
