/* global document, MutationObserver */
const GITHUB = "https://github.com/novaeth/dsh-workbench";

function mountGithubLink() {
  const right = document.querySelector(".pagoda-doc-header__right");
  if (!right || right.querySelector(".wb-header-gh")) return;

  const link = document.createElement("a");
  link.className = "wb-header-gh";
  link.href = GITHUB;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "GitHub";
  right.append(link);
}

export default {
  showAnchor(route) {
    return !(route.path === "/" || route.path === "/index");
  },
  install() {
    const root = document.body ?? document.documentElement;
    new MutationObserver(mountGithubLink).observe(root, { childList: true, subtree: true });
    mountGithubLink();
  },
};
