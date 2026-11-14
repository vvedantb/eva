/**
 * The catalog Eva composes and validates chat panels against: the kit's
 * component definitions (`@vvedantb/server/generative-ui`) on json-render's
 * React schema, the schema of the web renderer
 * (`@vvedantb/ui/generative-ui`). The phone renderer
 * (`@vvedantb/native-ui/generative-ui`) uses the same definitions.
 *
 * Built here, not imported from the web kit, so the `"use node"` composer
 * loads no React components.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { generativeUiCatalogDefinition } from "@vvedantb/server/generative-ui";

export const chatUiCatalog = defineCatalog(schema, generativeUiCatalogDefinition);
