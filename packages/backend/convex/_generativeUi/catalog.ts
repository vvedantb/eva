import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { generativeUiCatalogDefinition } from "@vvedantb/server/generative-ui";

export const chatUiCatalog = defineCatalog(schema, generativeUiCatalogDefinition);
