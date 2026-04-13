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

  async function initProfile() {
    const btn_user = document.querySelector(".user");
    const btn_logout = document.querySelector(".btn-logout");

    if (!btn_user) return;
    if (!btn_logout) return;

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

    btn_user.querySelector("span.auth-name").textContent = user.first_name;
    btn_user.querySelector("span.auth-type").textContent = user.type;

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

  function initSidebar() {
    const menu = document.querySelector(".sidebar nav");
    if (!menu) return;

    const user = JSON.parse(localStorage.getItem("user"));

    if (!user) return;

    let links = [];

    switch (user.type) {
      case "admin":
        links = [
          { href: "../admin/dashboard.html", label: "Dashboard" },
          { href: "../enrollments/list.html", label: "Enrollments" },
          { href: "../students/list.html", label: "Students" },
          { href: "../treasury/billing.html", label: "Billing" },
          { href: "../treasury/transactions.html", label: "Transactions" },
          { href: "../admin/admin-list.html", label: "Admins" },
          { href: "../records/accounts.html", label: "Records Accounts" },
          { href: "../programs/list.html", label: "Programs" },
          { href: "../courses/list.html", label: "Courses" },
        ];
        break;

      case "treasury":
        links = [
          { href: "../admin/dashboard.html", label: "Dashboard" },
          { href: "../enrollments/list.html", label: "Enrollments" },
          { href: "../treasury/billing.html", label: "Billing" },
          { href: "../treasury/document-payments.html", label: "Doc Payments" },
          { href: "../treasury/transactions.html", label: "Transactions" },
          { href: "../programs/list.html", label: "Programs" },
          { href: "../courses/list.html", label: "Courses" },
        ];
        break;

      case "student":
        links = [
          { href: "../student/dashboard.html", label: "Dashboard" },
          { href: "../profile/profile.html", label: "Profile" },
          { href: "../courses/list.html", label: "My Courses" },
        ];
        break;

      case "records":
        links = [
          { href: "../records/dashboard.html", label: "Dashboard" },
          { href: "../records/accounts.html", label: "Accounts" },
          { href: "../students/list.html", label: "Students" },
        ];
        break;

      default:
        links = [{ href: "../auth/login.html", label: "Login" }];
    }

    menu.innerHTML = links
      .map(
        (link) => `
    <a href="${link.href}">${link.label}</a>
  `,
      )
      .join("");

    const currentPath = window.location.pathname.split("/").pop();

    menu.querySelectorAll("a").forEach((link) => {
      const linkPath = link.getAttribute("href")?.split("/").pop();

      if (linkPath && linkPath === currentPath) {
        link.classList.add("active");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await autoLoadComponents();
    getDocumentTitle();
    initSidebar();
    initProfile();
  });

  window.loadComponent = loadComponent;
  window.autoLoadComponents = autoLoadComponents;
})();
