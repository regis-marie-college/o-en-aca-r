/**
 * -----------------------------------------------------------------------------
 * Component Auto Loader (Non-Module Version)
 * -----------------------------------------------------------------------------
 * Automatically loads HTML partials into elements
 * using the data-component attribute.
 *
 * Example:
 *   <div data-component="/partials/sidenav.html"></div>
 *
 * Features:
 *   - Auto-scan on DOMContentLoaded
 *   - Caching (prevents duplicate fetch)
 *   - Nested component support
 *   - Manual loadComponent() available globally
 *
 * Author: OENACAR
 * -----------------------------------------------------------------------------
 */

(function () {
  const componentCache = new Map();

  /**
   * Load a single component into an element
   */
  async function loadComponent(element) {
    const url = element.getAttribute("data-component");
    if (!url) return;

    try {
      let html;

      // Use cache if already fetched
      if (componentCache.has(url)) {
        html = componentCache.get(url);
      } else {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to load component: ${url}`);
        }

        html = await response.text();
        componentCache.set(url, html);
      }

      element.innerHTML = html;

      // Prevent re-loading
      element.removeAttribute("data-component");

      // Load nested components inside this one
      await autoLoadComponents(element);
    } catch (error) {
      console.error("[ComponentLoader]", error);
    }
  }

  /**
   * Scan and load all components inside a container
   */
  async function autoLoadComponents(root) {
    root = root || document;

    const elements = root.querySelectorAll("[data-component]");

    for (const el of elements) {
      await loadComponent(el);
    }
  }

  async function getDocumentTitle() {
    const elements = document.querySelectorAll("[data-title]");
    elements.forEach((el) => {
      el.textContent = document.title;
    });
  }

  // Auto-run when DOM is ready
  document.addEventListener("DOMContentLoaded", async function () {
    await autoLoadComponents();
    getDocumentTitle();
  });

  // Optional: expose globally for manual usage
  window.loadComponent = loadComponent;
  window.autoLoadComponents = autoLoadComponents;
})();
