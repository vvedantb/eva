import type { Plugin } from "vite";

const IMPORT_RE =
  /import\s*\{([^}]*)\}\s*from\s*(["'])@tabler\/icons-react\2;?/g;
const MEMBER_RE = /^(Icon\w+)(?:\s+as\s+(\w+))?$/;

export function tablerDeepImports(): Plugin {
  return {
    name: "eva-tabler-deep-imports",
    apply: "build",
    transform: {
      filter: {
        id: {
          include: /\.[jt]sx?(?:\?.*)?$/,
          exclude: /node_modules/,
        },
        code: { include: "@tabler/icons-react" },
      },
      handler(code) {
        let changed = false;
        const out = code.replace(IMPORT_RE, (statement, members: string) => {
          const deep: string[] = [];
          const keep: string[] = [];
          for (const raw of members.split(",")) {
            const member = raw.trim();
            if (!member) continue;
            const match = member.match(MEMBER_RE);
            if (match) {
              const local = match[2] ?? match[1];
              deep.push(
                `import ${local} from "@tabler/icons-react/dist/esm/icons/${match[1]}.mjs";`,
              );
            } else {
              keep.push(member);
            }
          }
          if (deep.length === 0) return statement;
          changed = true;
          if (keep.length > 0) {
            deep.push(
              `import { ${keep.join(", ")} } from "@tabler/icons-react";`,
            );
          }
          return deep.join("\n");
        });
        if (changed) return { code: out, map: null };
      },
    },
  };
}
