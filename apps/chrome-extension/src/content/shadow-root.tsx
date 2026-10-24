import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ReactNode } from "react";
import { EvaUiProvider } from "@eva/ui";
import contentCss from "./content.css?inline";

interface ShadowMount {
  host: HTMLDivElement;
  wrapper: HTMLDivElement;
  root: Root;
  render: (node: ReactNode) => void;
  unmount: () => void;
}

export function createShadowMount(): ShadowMount {
  const host = document.createElement("div");
  host.setAttribute("data-eva-overlay", "");
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const font = document.createElement("link");
  font.rel = "stylesheet";
  font.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
  shadow.appendChild(font);

  const style = document.createElement("style");
  style.textContent = contentCss;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  shadow.appendChild(wrapper);

  const root = createRoot(wrapper);

  return {
    host,
    wrapper,
    root,
    render(node: ReactNode) {
      root.render(<EvaUiProvider>{node}</EvaUiProvider>);
    },
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
