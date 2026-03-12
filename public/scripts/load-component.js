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

  async function initLogout() {
    const btn_user = document.querySelector(".user");
    const btn_logout = document.querySelector(".btn-logout");

    btn_user.addEventListener("click", (e) => {
      e.stopPropagation();
      btn_user.classList.toggle("active");
      console.log(btn_user);
    });

    document.addEventListener("click", () => {
      btn_user.classList.remove("active");
    });

    const user = JSON.parse(localStorage.getItem("user"));

    if (!btn_user) return;

    btn_user.querySelector("span").textContent = user.first_name;

    btn_logout.addEventListener("click", async () => {
      try {
        const response = await fetch(
          `${window.APP_CONFIG.API_BASE_URL}/auth/logout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ id: user.id }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Something went wrong");
        }
        localStorage.removeItem("user");
        window.location.assign("/auth/login.html");
      } catch (error) {
        console.error(error);
      }
    });
  }

  // Auto-run when DOM is ready
  document.addEventListener("DOMContentLoaded", async function () {
    await autoLoadComponents();
    getDocumentTitle();
    initLogout();
  });

  // Optional: expose globally for manual usage
  window.loadComponent = loadComponent;
  window.autoLoadComponents = autoLoadComponents;
})();
