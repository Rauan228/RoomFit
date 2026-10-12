import { writeFileSync } from "node:fs";
import {
  documentSchema,
  CATALOG,
  createTemplate,
  TEMPLATE_NAMES,
} from "../packages/core/src/index";
import { zodToJsonSchema } from "zod-to-json-schema";
writeFileSync(
  "api/roomfit/project.schema.json",
  JSON.stringify(zodToJsonSchema(documentSchema), null, 2),
);
writeFileSync("api/roomfit/catalog.json", JSON.stringify(CATALOG, null, 2));
writeFileSync(
  "api/roomfit/templates.json",
  JSON.stringify(
    TEMPLATE_NAMES.map((name) => ({
      id: name,
      name,
      document: createTemplate(name),
    })),
    null,
    2,
  ),
);
console.log("Shared project schema and catalog exported for API.");
