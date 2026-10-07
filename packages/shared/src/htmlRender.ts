/**
 * Agent-authored HTML pages ("HTML renders") are self-contained documents an
 * agent publishes into a chat with the `render_html` MCP tool. Convex stores
 * the page as written; the client injects a small bootstrap into its head,
 * shows it in a sandboxed `srcdoc` iframe and hands it the active theme as CSS
 * custom properties.
 *
 * The bridge between a page and the chat speaks the MCP Apps method names
 * (JSON-RPC over postMessage), so the same host code can later drive upstream
 * MCP apps: https://github.com/modelcontextprotocol/ext-apps
 */

import { z } from "zod";

/** Convex documents cap at 1 MiB, so the page is capped in UTF-8 bytes. */
export const HTML_RENDER_MAX_BYTES = 900_000;
export const HTML_RENDER_MAX_TITLE_CHARS = 200;
export const HTML_RENDER_MIN_HEIGHT = 80;
export const HTML_RENDER_MAX_HEIGHT = 2_000;

/** Eva's theme tokens a page can read; see `docs/eva-ui.md` for what each means. */
export const HTML_RENDER_THEME_VARIABLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--muted",
  "--muted-foreground",
  "--secondary",
  "--secondary-foreground",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--ring",
  "--destructive",
  "--destructive-foreground",
  "--success",
  "--success-foreground",
  "--warning",
  "--warning-foreground",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--radius",
  "--font-sans",
  "--font-mono",
] as const;

/** Agent-facing rules for a page that sits inside a chat reply. */
export const HTML_RENDER_PAGE_GUIDE = [
  "Write one self-contained document with inline <style> and <script>; remote http(s) resources such as a CDN chart library load as-is.",
  "The frame has no border and sits on the chat's own background, as wide as the reply column (about 720px on desktop, about 360px on phones).",
  "Leave html, body and the outermost element without a background colour, and give the outermost element a fluid width with no horizontal padding, outer card, border or banner title.",
  "A box that needs its own background gets at least 16px padding on every side and var(--radius) corners.",
  "Give charts fixed pixel heights. Let content set the page height: never use 100vh or height:100% on html or body, because the frame grows to fit the page.",
  `Eva sets its live theme on :root and updates it when the user switches light/dark: ${HTML_RENDER_THEME_VARIABLES.join(", ")}. Colour values are complete CSS colours (use var(--primary), not hsl(var(--primary))).`,
  "Links open in a new browser tab. Storage APIs are in-memory only.",
].join(" ");

const SIZE_CHANGED_METHOD = "ui/notifications/size-changed";
const HOST_CONTEXT_CHANGED_METHOD = "ui/notifications/host-context-changed";
const OPEN_LINK_METHOD = "ui/open-link";

export type HtmlRenderAppearance = "light" | "dark";

/** The MCP Apps `host-context-changed` params: appearance plus CSS variables. */
export interface HtmlRenderHostContext {
  theme: HtmlRenderAppearance;
  styles: { variables: Record<string, string> };
}

/** The frame height for a page: its reported height, else the agent's guess, in bounds. */
export function htmlRenderFrameHeight(
  requested: number,
  reported: number | null,
): number {
  return Math.min(
    HTML_RENDER_MAX_HEIGHT,
    Math.max(HTML_RENDER_MIN_HEIGHT, Math.ceil(reported ?? requested)),
  );
}

/**
 * A theme token as a complete CSS value. Eva stores colours as bare RGB
 * channels (`244 245 246`) for Tailwind's alpha syntax; a page should be able
 * to write `var(--primary)`, so those are wrapped in `rgb()`.
 */
export function htmlRenderThemeValue(raw: string): string {
  const value = raw.trim();
  return /^\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?$/.test(value)
    ? `rgb(${value})`
    : value;
}

/** The message that pushes a theme change into a live page. */
export function htmlRenderHostContextMessage(context: HtmlRenderHostContext): {
  jsonrpc: "2.0";
  method: typeof HOST_CONTEXT_CHANGED_METHOD;
  params: HtmlRenderHostContext;
} {
  return {
    jsonrpc: "2.0",
    method: HOST_CONTEXT_CHANGED_METHOD,
    params: context,
  };
}

/**
 * A message a page posted to the chat, parsed at the boundary. Anything else
 * a page posts (or a malformed bridge message) fails the parse and is ignored.
 */
export const htmlRenderFrameMessage = z.discriminatedUnion("method", [
  z.object({
    jsonrpc: z.literal("2.0"),
    method: z.literal(SIZE_CHANGED_METHOD),
    params: z.object({ height: z.number().finite().positive() }),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    method: z.literal(OPEN_LINK_METHOD),
    params: z.object({
      url: z
        .string()
        .url()
        .refine((url) => /^https?:/i.test(url), "Only http(s) links open."),
    }),
  }),
]);

export const HTML_RENDER_SIZE_CHANGED = SIZE_CHANGED_METHOD;

/**
 * Base styles, injected before the page's own so the page wins: transparent
 * canvas on the chat background, theme text colour and font.
 */
const BASE_CSS =
  "html{background:transparent;color:var(--foreground);font-family:var(--font-sans,system-ui,sans-serif)}body{margin:0}";

/**
 * Runs before the page's own scripts. It applies theme changes the host
 * posts, reports the page height, routes link
 * clicks to the host (a popup from the sandbox would inherit the sandbox),
 * and replaces Web Storage, which throws in an opaque origin, with an
 * in-memory store.
 */
const BOOTSTRAP_SCRIPT = `(function(){
var s=document.getElementById("eva-theme"),n=0,inFrame=window.parent!==window;
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(name){try{var t=window[name];if(t){t.getItem("__probe");return}}catch(e){}try{Object.defineProperty(window,name,{value:mem(),configurable:true})}catch(e){}});
function apply(p){if(!s||!p||typeof p!=="object"||!p.styles||typeof p.styles.variables!=="object")return;var c=":root{color-scheme:"+(p.theme==="dark"?"dark":"light")+";",v=p.styles.variables;for(var k in v){if(/^--[a-z0-9-]+$/.test(k))c+=k+":"+String(v[k]).replace(/[;{}<>]/g,"")+";"}s.textContent=c+"}"}
window.addEventListener("message",function(e){var d=e.data;if(e.source===window.parent&&d&&d.jsonrpc==="2.0"&&d.method===${JSON.stringify(HOST_CONTEXT_CHANGED_METHOD)})apply(d.params)});
document.addEventListener("click",function(e){var a=e.isTrusted?e.composedPath().find(function(t){return t&&t.matches&&t.matches("a[href]")}):null,u;if(!a)return;try{u=new URL(a.getAttribute("href"),document.baseURI)}catch(x){return}if(!/^https?:$/.test(u.protocol)||u.href.split("#")[0]===location.href.split("#")[0])return;if(inFrame){e.preventDefault();window.parent.postMessage({jsonrpc:"2.0",id:"eva-link-"+(++n),method:${JSON.stringify(OPEN_LINK_METHOD)},params:{url:u.href}},"*")}else{a.setAttribute("target","_blank");a.setAttribute("rel","noopener")}},true);
if(inFrame){var h,o,z=function(){var r=document.documentElement,v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height);if(v===h)return;h=v;window.parent.postMessage({jsonrpc:"2.0",method:${JSON.stringify(SIZE_CHANGED_METHOD)},params:{height:v}},"*")};if(window.ResizeObserver){o=new ResizeObserver(z);o.observe(document.documentElement)}document.addEventListener("DOMContentLoaded",function(){if(o&&document.body)o.observe(document.body);z()});window.addEventListener("load",z)}
})();`;

/** The theme as one `:root` rule; values are stripped of anything that could end the rule. */
function themeCss(context: HtmlRenderHostContext): string {
  const declarations = Object.entries(context.styles.variables)
    .filter(([name]) => /^--[a-z0-9-]+$/.test(name))
    .map(([name, value]) => `${name}:${value.replace(/[;{}<>]/g, "")};`)
    .join("");
  return `:root{color-scheme:${context.theme};${declarations}}`;
}

/**
 * The page with the bootstrap first in its head, the current theme already in
 * it so the first paint has the right colours. It goes after `<head>`, else
 * after `<html>`, else after the doctype — never before a doctype, which
 * would drop the page into quirks mode.
 */
export function injectHtmlRenderBootstrap(
  html: string,
  context: HtmlRenderHostContext,
): string {
  const bootstrap = `<style id="eva-theme">${themeCss(context)}</style><style>${BASE_CSS}</style><script>${BOOTSTRAP_SCRIPT}</script>`;
  for (const tag of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype\b[^>]*>/i]) {
    const match = tag.exec(html);
    if (match) {
      const end = match.index + match[0].length;
      return html.slice(0, end) + bootstrap + html.slice(end);
    }
  }
  return bootstrap + html;
}
