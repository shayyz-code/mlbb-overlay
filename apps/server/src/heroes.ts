import type { Hero } from "@shayyz/contracts";
import heroCatalog from "../../../config/heroes.json";

function slug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const heroes: Hero[] = heroCatalog
  .map(({ name }) => ({ id: slug(name), name }))
  .filter(
    (hero, index, list) =>
      list.findIndex((candidate) => candidate.id === hero.id) === index,
  )
  .sort((left, right) => left.name.localeCompare(right.name));
