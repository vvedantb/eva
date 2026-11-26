import * as Clipboard from "expo-clipboard";

/** Copies text, for the Markdown code block's and table's copy buttons, as the web. */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
