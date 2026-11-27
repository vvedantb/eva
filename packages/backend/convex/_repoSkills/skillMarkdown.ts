export const SKILL_FILE_NAME = "SKILL.md";

export type ParsedSkill = {
  title: string;
  description: string;
};

export type ParseSkillMarkdownFailure =
  | "no_frontmatter"
  | "missing_title"
  | "missing_description";

export type ParseSkillMarkdownResult =
  | { ok: true; skill: ParsedSkill }
  | { ok: false; reason: ParseSkillMarkdownFailure };

type BlockParseResult = {
  value: string;
  nextIndex: number;
};

function parseScalarValue(raw: string): string {
  const value = raw.trim();
  if (
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) &&
    value.length >= 2
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function parseIndentedBlock(
  lines: string[],
  startIndex: number,
): BlockParseResult {
  const parts: string[] = [];
  let nextIndex = startIndex;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    if (line.trim() === "") {
      parts.push("");
      nextIndex++;
      continue;
    }
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      break;
    }
    parts.push(line.trim());
    nextIndex++;
  }

  return {
    value: parts.join(" ").replace(/\s+/g, " ").trim(),
    nextIndex,
  };
}

function getFrontmatterLines(markdown: string): string[] | null {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return null;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      return lines.slice(1, i);
    }
  }

  return null;
}

function parseDescriptionField(
  frontmatterLines: string[],
  lineIndex: number,
): BlockParseResult {
  const line = frontmatterLines[lineIndex] ?? "";
  const rawDescription = line.slice("description:".length).trim();

  if (rawDescription.startsWith(">") || rawDescription.startsWith("|")) {
    return parseIndentedBlock(frontmatterLines, lineIndex + 1);
  }

  if (rawDescription.length > 0) {
    return {
      value: parseScalarValue(rawDescription),
      nextIndex: lineIndex + 1,
    };
  }

  return parseIndentedBlock(frontmatterLines, lineIndex + 1);
}

export function parseSkillMarkdown(
  markdown: string,
  fallbackTitle: string,
): ParseSkillMarkdownResult {
  const frontmatterLines = getFrontmatterLines(markdown);
  if (!frontmatterLines) {
    return { ok: false, reason: "no_frontmatter" };
  }

  let title = fallbackTitle;
  let description = "";

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i] ?? "";
    if (line.startsWith("name:")) {
      title = parseScalarValue(line.slice("name:".length));
      continue;
    }
    if (line.startsWith("description:")) {
      const parsedDescription = parseDescriptionField(frontmatterLines, i);
      description = parsedDescription.value;
      i = parsedDescription.nextIndex - 1;
    }
  }

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  if (!trimmedTitle) {
    return { ok: false, reason: "missing_title" };
  }
  if (!trimmedDescription) {
    return { ok: false, reason: "missing_description" };
  }

  return {
    ok: true,
    skill: {
      title: trimmedTitle,
      description: trimmedDescription,
    },
  };
}

export function formatSkillSkipWarning(
  directoryPath: string,
  reason: ParseSkillMarkdownFailure | "missing_file",
): string {
  const skillPath = `${directoryPath}/${SKILL_FILE_NAME}`;
  switch (reason) {
    case "missing_file":
      return `Skipped ${directoryPath}: no ${SKILL_FILE_NAME} found.`;
    case "no_frontmatter":
      return `Skipped ${skillPath}: missing YAML frontmatter (expected opening ---).`;
    case "missing_title":
      return `Skipped ${skillPath}: frontmatter needs a non-empty name.`;
    case "missing_description":
      return `Skipped ${skillPath}: frontmatter needs a non-empty description.`;
  }
}
