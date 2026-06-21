// =========================================================
// Carga pública de catálogo (solo lectura, sin login)
// Usado por: index.html (destacados) y pages/catalogo.html
// =========================================================

function formatPrice(value) {
  if (value == null) return "";
  return "$" + Number(value).toFixed(0);
}

function productCardHTML(p) {
  const categoryName = p.categories ? p.categories.name : "";
  const soldOut = p.status === "agotado";
  return `
    <article class="product-card" data-category="${categoryName}" data-id="${p.id}">
      <div style="position:relative;">
        <img src="${p.image_url || ''}" alt="${p.name}" />
        ${soldOut ? `<span style="position:absolute; top:10px; left:10px; background:#2A0309; color:#D4AF37; font-size:11px; font-weight:800; padding:5px 10px; border-radius:999px;">AGOTADO</span>` : ""}
      </div>
      <div class="product-info">
        <span>${categoryName}</span>
        <h3>${p.name}</h3>
        <p>${formatPrice(p.price)}</p>
      </div>
    </article>`;
}

function categoryCardHTML(cat) {
  const fallbackImage = `assets/images/categorias/${cat.slug}.jpg`;
  return `
    <article class="category-card">
      <img src="${cat.image_url || fallbackImage}" alt="${cat.name}" />
      <div>
        <h3>${cat.name}</h3>
        <a href="pages/catalogo.html?categoria=${encodeURIComponent(cat.name)}">Ver más</a>
      </div>
    </article>`;
}

async function renderFilterButtons(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data) return;

  const buttonsHTML =
    `<button class="filter-btn active" data-filter="todos">Todos</button>` +
    data.map((c) => `<button class="filter-btn" data-filter="${c.name}">${c.name}</button>`).join("");

  container.innerHTML = buttonsHTML;
  attachFilterListeners();
}

async function renderFeaturedProducts(limit = 8) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name, slug)")
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) return;
  grid.innerHTML = data.map(productCardHTML).join("");
  attachFilterListeners();
  attachProductClickHandlers(data);
}

async function renderCategoryGrid() {
  const grid = document.querySelector(".category-grid");
  if (!grid) return;

  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .limit(4);

  if (error || !data) return;
  grid.innerHTML = data.map(categoryCardHTML).join("");
}

async function renderFullCatalog() {
  const grid = document.getElementById("catalogGrid");
  if (!grid) return;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name, slug)")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    grid.innerHTML = "<p>No se pudieron cargar los productos.</p>";
    return;
  }

  grid.innerHTML = data.map(productCardHTML).join("");
  attachFilterListeners();
  attachProductClickHandlers(data);

  // Filtro inicial si viene ?categoria= en la URL
  const params = new URLSearchParams(window.location.search);
  const categoriaParam = params.get("categoria");
  if (categoriaParam) {
    const matchBtn = document.querySelector(`.filter-btn[data-filter="${categoriaParam}"]`);
    if (matchBtn) matchBtn.click();
  }
}

function attachFilterListeners() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.dataset.filter;
      document.querySelectorAll(".product-card").forEach((card) => {
        const show = filter === "todos" || card.dataset.category === filter;
        card.classList.toggle("is-hidden", !show);
      });
    });
  });
}

async function applyWhatsappSettings() {
  const { data, error } = await supabaseClient.from("site_settings").select("*");
  if (error || !data) return;

  const map = {};
  data.forEach((row) => (map[row.key] = row.value));

  const number = map.whatsapp_number;
  const message = map.whatsapp_message || "";
  if (!number) return;

  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
    link.setAttribute("href", url);
  });
}

// =========================================================
// MODAL DE PRODUCTO (clic en una tarjeta abre detalle)
// =========================================================
function injectModalStyles() {
  if (document.getElementById("dulce-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "dulce-modal-styles";
  style.textContent = `
    .dulce-modal-overlay {
      position: fixed; inset: 0; background: rgba(20,2,5,.72);
      display: flex; align-items: center; justify-content: center;
      z-index: 999; padding: 22px; opacity: 0; pointer-events: none;
      transition: opacity .25s ease;
    }
    .dulce-modal-overlay.is-open { opacity: 1; pointer-events: all; }
    .dulce-modal-box {
      background: var(--cream, #F8F4EE); border-radius: 22px; max-width: 760px;
      width: 100%; max-height: 88vh; overflow-y: auto; display: grid;
      grid-template-columns: 1fr 1fr; box-shadow: 0 30px 80px rgba(0,0,0,.35);
      transform: translateY(16px); transition: transform .25s ease;
    }
    .dulce-modal-overlay.is-open .dulce-modal-box { transform: translateY(0); }
    .dulce-modal-box img { width: 100%; height: 100%; object-fit: cover; min-height: 280px; }
    .dulce-modal-info { padding: 28px; position: relative; }
    .dulce-modal-close {
      position: absolute; top: 14px; right: 14px; width: 34px; height: 34px;
      border-radius: 999px; border: none; background: rgba(42,3,9,.08);
      font-size: 18px; cursor: pointer; color: var(--wine-dark, #2A0309);
    }
    .dulce-modal-info span.dulce-modal-cat {
      text-transform: uppercase; letter-spacing: .14em; font-size: 11px;
      font-weight: 800; color: var(--gold-soft, #DDBB66);
    }
    .dulce-modal-info h2 {
      font-family: Georgia, serif; color: var(--wine-dark, #2A0309);
      font-size: 28px; margin: 8px 0 12px;
    }
    .dulce-modal-info .dulce-modal-price {
      font-weight: 800; color: var(--wine, #2A0309); font-size: 20px; margin-bottom: 14px;
    }
    .dulce-modal-info .dulce-modal-desc { color: var(--muted, #7C6E63); line-height: 1.6; margin-bottom: 18px; }
    @media (max-width: 640px) {
      .dulce-modal-box { grid-template-columns: 1fr; }
      .dulce-modal-box img { min-height: 220px; }
    }
  `;
  document.head.appendChild(style);
}

function ensureModalElement() {
  let overlay = document.getElementById("dulceProductModal");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "dulceProductModal";
  overlay.className = "dulce-modal-overlay";
  overlay.innerHTML = `
    <div class="dulce-modal-box">
      <img id="dulceModalImg" src="" alt="" />
      <div class="dulce-modal-info">
        <button class="dulce-modal-close" id="dulceModalClose" aria-label="Cerrar">✕</button>
        <span class="dulce-modal-cat" id="dulceModalCat"></span>
        <h2 id="dulceModalName"></h2>
        <p class="dulce-modal-price" id="dulceModalPrice"></p>
        <p class="dulce-modal-desc" id="dulceModalDesc"></p>
        <span class="badge" id="dulceModalStatus"></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeProductModal();
  });
  document.getElementById("dulceModalClose").addEventListener("click", closeProductModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProductModal();
  });

  return overlay;
}

function openProductModal(p) {
  injectModalStyles();
  const overlay = ensureModalElement();

  document.getElementById("dulceModalImg").src = p.image_url || "";
  document.getElementById("dulceModalImg").alt = p.name;
  document.getElementById("dulceModalCat").textContent = p.categories ? p.categories.name : "";
  document.getElementById("dulceModalName").textContent = p.name;
  document.getElementById("dulceModalPrice").textContent = formatPrice(p.price);
  document.getElementById("dulceModalDesc").textContent = p.description || "Sin descripción disponible.";

  const statusEl = document.getElementById("dulceModalStatus");
  statusEl.textContent = p.status === "agotado" ? "Agotado" : "Disponible";
  statusEl.className = `badge ${p.status}`;

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeProductModal() {
  const overlay = document.getElementById("dulceProductModal");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
}

function attachProductClickHandlers(products) {
  document.querySelectorAll(".product-card").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const product = products.find((p) => p.id === card.dataset.id);
      if (product) openProductModal(product);
    });
  });
}

// ---------- INICIO ----------
document.addEventListener("DOMContentLoaded", async () => {
  applyWhatsappSettings();
  await renderFilterButtons(".filters");
  await renderFeaturedProducts();
  await renderCategoryGrid();
  await renderFullCatalog();
});
