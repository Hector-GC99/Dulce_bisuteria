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
    <article class="product-card" data-category="${categoryName}">
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
  return `
    <article class="category-card">
      <img src="${cat.image_url || 'assets/images/banners/categoria-generica.jpg'}" alt="${cat.name}" />
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

document.addEventListener("DOMContentLoaded", async () => {
  await renderFilterButtons(".filters");
  await renderFeaturedProducts();
  await renderCategoryGrid();
  await renderFullCatalog();
});