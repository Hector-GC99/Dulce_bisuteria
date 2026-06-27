// =========================================================
// Panel de administración DULCE
// Toda escritura requiere sesión activa (ver políticas RLS en Supabase).
// Incluye administración de variantes de color por producto.
// =========================================================

const loginView = document.getElementById("loginView");
const panelView = document.getElementById("panelView");
const toastEl = document.getElementById("toast");

let categoriesCache = [];
let productsCache = [];
let productVariantCountMap = {};
let productVariantsDraft = [];
let selectedProductIds = new Set();
let collapsedProductGroups = new Set();
let productToolbarInitialized = false;
let productFilters = {
  search: "",
  category: "all",
  status: "all",
  variants: "all",
  sort: "sort_asc",
  group: "none"
};

const COLOR_PRESETS = [
  { name: "Negro", hex: "#111111" },
  { name: "Blanco", hex: "#FFFFFF" },
  { name: "Rosa", hex: "#E8A6B8" },
  { name: "Rosa palo", hex: "#D9A6A9" },
  { name: "Rojo", hex: "#B3261E" },
  { name: "Vino", hex: "#5A0B18" },
  { name: "Azul cielo", hex: "#9ED8F2" },
  { name: "Turquesa", hex: "#40BFB4" },
  { name: "Verde jade", hex: "#4C9A7B" },
  { name: "Café", hex: "#8B5E3C" },
  { name: "Dorado", hex: "#D4AF37" },
  { name: "Plata", hex: "#C0C0C0" }
];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeHex(hex) {
  if (!hex) return "#C0C0C0";
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function getStoragePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = "/product-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

async function removeImageFromStorage(url) {
  const path = getStoragePathFromPublicUrl(url);
  if (!path) return { ok: true, skipped: true };

  const { error } = await supabaseClient.storage
    .from("product-images")
    .remove([path]);

  return { ok: !error, error };
}

// ---------- AUTENTICACIÓN ----------
async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    loginView.classList.add("hidden");
    panelView.classList.remove("hidden");
    initPanel();
  } else {
    loginView.classList.remove("hidden");
    panelView.classList.add("hidden");
  }
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Correo o contraseña incorrectos.";
    return;
  }
  checkSession();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  checkSession();
});

// ---------- TABS ----------
document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-products").classList.toggle("hidden", tab.dataset.tab !== "products");
    document.getElementById("tab-categories").classList.toggle("hidden", tab.dataset.tab !== "categories");
    document.getElementById("tab-settings").classList.toggle("hidden", tab.dataset.tab !== "settings");
  });
});

// ---------- INIT ----------
async function initPanel() {
  renderColorPresetButtons();
  renderProductVariantsEditor();
  initProductToolbar();
  await loadCategories();
  await loadProducts();
  await loadSettings();
}

// =========================================================
// CATEGORÍAS
// =========================================================
async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) { showToast("Error al cargar categorías"); return; }

  categoriesCache = data || [];
  renderCategoriesTable(categoriesCache);
  renderCategoryOptions(categoriesCache);
}

function renderCategoriesTable(categories) {
  const body = document.getElementById("categoriesTableBody");
  body.innerHTML = "";
  categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(cat.name)}</td>
      <td>${cat.sort_order ?? 0}</td>
      <td class="row-actions">
        <button data-id="${cat.id}" class="edit-cat">Editar</button>
        <button data-id="${cat.id}" class="danger delete-cat">Eliminar</button>
      </td>`;
    body.appendChild(tr);
  });

  body.querySelectorAll(".edit-cat").forEach((btn) =>
    btn.addEventListener("click", () => editCategory(btn.dataset.id))
  );
  body.querySelectorAll(".delete-cat").forEach((btn) =>
    btn.addEventListener("click", () => deleteCategory(btn.dataset.id))
  );
}

function renderCategoryOptions(categories) {
  const select = document.getElementById("productCategory");
  select.innerHTML = categories
    .map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`)
    .join("");

  renderProductToolbarOptions();
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

document.getElementById("categoryImageFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById("categoryImgPreview");
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");

  const errorEl = document.getElementById("categoryError");
  errorEl.textContent = "Subiendo imagen...";

  const fileExt = file.name.split(".").pop();
  const fileName = `categories/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("product-images")
    .upload(fileName, file);

  if (uploadError) {
    errorEl.textContent = "No se pudo subir la imagen.";
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  document.getElementById("categoryImageUrl").value = publicUrlData.publicUrl;
  errorEl.textContent = "";
});

document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("categoryError");
  errorEl.textContent = "";

  const id = document.getElementById("categoryId").value;
  const name = document.getElementById("categoryName").value.trim();
  const sort_order = Number(document.getElementById("categorySort").value) || 0;
  const image_url = document.getElementById("categoryImageUrl").value || null;
  const slug = slugify(name);

  const payload = { name, slug, sort_order, image_url };

  let result;
  if (id) {
    result = await supabaseClient.from("categories").update(payload).eq("id", id);
  } else {
    result = await supabaseClient.from("categories").insert(payload);
  }

  if (result.error) {
    errorEl.textContent = "No se pudo guardar (¿nombre repetido?).";
    return;
  }

  resetCategoryForm();
  await loadCategories();
  await loadProducts();
  showToast("Categoría guardada");
});

function editCategory(id) {
  const cat = categoriesCache.find((c) => c.id === id);
  if (!cat) return;
  document.getElementById("categoryId").value = cat.id;
  document.getElementById("categoryName").value = cat.name;
  document.getElementById("categorySort").value = cat.sort_order ?? 0;
  document.getElementById("categoryImageUrl").value = cat.image_url || "";

  const preview = document.getElementById("categoryImgPreview");
  if (cat.image_url) {
    preview.src = cat.image_url;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }

  document.getElementById("categoryFormTitle").textContent = "Editar categoría";
  document.getElementById("cancelCategoryEdit").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetCategoryForm() {
  document.getElementById("categoryForm").reset();
  document.getElementById("categoryId").value = "";
  document.getElementById("categoryImageUrl").value = "";
  document.getElementById("categoryImgPreview").classList.add("hidden");
  document.getElementById("categoryFormTitle").textContent = "Agregar categoría";
  document.getElementById("cancelCategoryEdit").classList.add("hidden");
}

document.getElementById("cancelCategoryEdit").addEventListener("click", resetCategoryForm);

async function deleteCategory(id) {
  if (!confirm("¿Eliminar esta categoría? Los productos quedarán sin categoría.")) return;
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) { showToast("No se pudo eliminar"); return; }
  await loadCategories();
  await loadProducts();
  showToast("Categoría eliminada");
}

// =========================================================
// PRODUCTOS
// =========================================================
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name)")
    .order("sort_order", { ascending: true });

  if (error) { showToast("Error al cargar productos"); return; }

  productsCache = data || [];
  await loadProductVariantCounts();
  renderProductToolbarOptions();
  renderProductsTable(productsCache);
}

async function loadProductVariantCounts() {
  productVariantCountMap = {};
  const { data, error } = await supabaseClient
    .from("product_variants")
    .select("product_id");

  if (error || !data) return;
  data.forEach((row) => {
    productVariantCountMap[row.product_id] = (productVariantCountMap[row.product_id] || 0) + 1;
  });
}

function initProductToolbar() {
  if (productToolbarInitialized) return;
  productToolbarInitialized = true;

  const search = document.getElementById("productSearchInput");
  const category = document.getElementById("productCategoryFilter");
  const status = document.getElementById("productStatusFilter");
  const variants = document.getElementById("productVariantsFilter");
  const sort = document.getElementById("productSortSelect");
  const group = document.getElementById("productGroupSelect");
  const clear = document.getElementById("clearProductFilters");
  const selectAll = document.getElementById("productSelectAll");
  const bulkAvailable = document.getElementById("bulkMarkAvailable");
  const bulkSoldOut = document.getElementById("bulkMarkSoldOut");
  const bulkDelete = document.getElementById("bulkDeleteProducts");

  search?.addEventListener("input", (e) => {
    productFilters.search = e.target.value.trim().toLowerCase();
    renderProductsTable(productsCache);
  });
  category?.addEventListener("change", (e) => {
    productFilters.category = e.target.value;
    renderProductsTable(productsCache);
  });
  status?.addEventListener("change", (e) => {
    productFilters.status = e.target.value;
    renderProductsTable(productsCache);
  });
  variants?.addEventListener("change", (e) => {
    productFilters.variants = e.target.value;
    renderProductsTable(productsCache);
  });
  sort?.addEventListener("change", (e) => {
    productFilters.sort = e.target.value;
    renderProductsTable(productsCache);
  });
  group?.addEventListener("change", (e) => {
    productFilters.group = e.target.value;
    collapsedProductGroups.clear();
    renderProductsTable(productsCache);
  });
  clear?.addEventListener("click", () => {
    productFilters = { search: "", category: "all", status: "all", variants: "all", sort: "sort_asc", group: "none" };
    if (search) search.value = "";
    if (category) category.value = "all";
    if (status) status.value = "all";
    if (variants) variants.value = "all";
    if (sort) sort.value = "sort_asc";
    if (group) group.value = "none";
    selectedProductIds.clear();
    collapsedProductGroups.clear();
    renderProductsTable(productsCache);
  });
  selectAll?.addEventListener("change", (e) => {
    const visibleIds = getFilteredProducts(productsCache).map((p) => p.id);
    if (e.target.checked) visibleIds.forEach((id) => selectedProductIds.add(id));
    else visibleIds.forEach((id) => selectedProductIds.delete(id));
    renderProductsTable(productsCache);
  });
  bulkAvailable?.addEventListener("click", () => bulkUpdateProductStatus("disponible"));
  bulkSoldOut?.addEventListener("click", () => bulkUpdateProductStatus("agotado"));
  bulkDelete?.addEventListener("click", bulkDeleteProducts);
}

function renderProductToolbarOptions() {
  const categoryFilter = document.getElementById("productCategoryFilter");
  if (!categoryFilter) return;

  const currentValue = categoryFilter.value || productFilters.category;
  categoryFilter.innerHTML = `<option value="all">Todas las categorías</option>` +
    categoriesCache.map((c) => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join("");
  categoryFilter.value = currentValue;
}

function getFilteredProducts(products) {
  let result = [...products];

  if (productFilters.search) {
    result = result.filter((p) => {
      const categoryName = p.categories?.name || "";
      const variantsCount = productVariantCountMap[p.id] || 0;
      const text = [p.name, p.description, categoryName, p.status, variantsCount ? "variantes tonos" : "sin variantes"]
        .join(" ")
        .toLowerCase();
      return text.includes(productFilters.search);
    });
  }

  if (productFilters.category !== "all") {
    result = result.filter((p) => p.category_id === productFilters.category);
  }

  if (productFilters.status !== "all") {
    result = result.filter((p) => p.status === productFilters.status);
  }

  if (productFilters.variants === "with") {
    result = result.filter((p) => (productVariantCountMap[p.id] || 0) > 0);
  }

  if (productFilters.variants === "without") {
    result = result.filter((p) => (productVariantCountMap[p.id] || 0) === 0);
  }

  const sortValue = productFilters.sort;
  result.sort((a, b) => {
    if (sortValue === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""));
    if (sortValue === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
    if (sortValue === "price_asc") return Number(a.price || 0) - Number(b.price || 0);
    if (sortValue === "price_desc") return Number(b.price || 0) - Number(a.price || 0);
    if (sortValue === "status") return String(a.status || "").localeCompare(String(b.status || ""));
    if (sortValue === "category") return String(a.categories?.name || "").localeCompare(String(b.categories?.name || ""));
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });

  return result;
}

function getProductGroupLabel(product) {
  if (productFilters.group === "category") return product.categories?.name || "Sin categoría";
  if (productFilters.group === "status") return product.status === "agotado" ? "Agotados" : "Disponibles";
  if (productFilters.group === "variants") return (productVariantCountMap[product.id] || 0) > 0 ? "Con variantes" : "Sin variantes";
  return "";
}

function updateBulkProductUI(visibleProducts) {
  const countEl = document.getElementById("selectedProductCount");
  const selectAll = document.getElementById("productSelectAll");
  const bulkToolbar = document.getElementById("bulkToolbar");
  const selectedVisible = visibleProducts.filter((p) => selectedProductIds.has(p.id));
  const selectedCount = selectedProductIds.size;

  if (countEl) countEl.textContent = selectedCount ? `${selectedCount} seleccionado${selectedCount === 1 ? "" : "s"}` : "Sin selección";
  if (bulkToolbar) bulkToolbar.classList.toggle("hidden", selectedCount === 0);

  if (selectAll) {
    selectAll.checked = visibleProducts.length > 0 && selectedVisible.length === visibleProducts.length;
    selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleProducts.length;
  }
}

function renderProductRow(product) {
  const variantsCount = productVariantCountMap[product.id] || 0;
  const checked = selectedProductIds.has(product.id) ? "checked" : "";
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="checkbox" class="product-row-check" data-id="${product.id}" ${checked} /></td>
    <td>${product.image_url ? `<img src="${product.image_url}" alt="" />` : "—"}</td>
    <td>${escapeHTML(product.name)}</td>
    <td>${product.categories ? escapeHTML(product.categories.name) : "—"}</td>
    <td>${product.price != null ? "$" + Number(product.price).toFixed(2) : "—"}</td>
    <td><span class="badge ${product.status}">${escapeHTML(product.status)}</span></td>
    <td>${variantsCount ? `${variantsCount} tono${variantsCount === 1 ? "" : "s"}` : "—"}</td>
    <td class="row-actions">
      <button data-id="${product.id}" class="edit-prod">Editar</button>
      <button data-id="${product.id}" class="toggle-stock">${product.status === "disponible" ? "Marcar agotado" : "Marcar disponible"}</button>
      <button data-id="${product.id}" class="danger delete-prod">Eliminar</button>
    </td>`;
  return tr;
}

function renderProductsTable(products) {
  const body = document.getElementById("productsTableBody");
  const filteredProducts = getFilteredProducts(products);
  body.innerHTML = "";

  selectedProductIds.forEach((id) => {
    if (!productsCache.some((p) => p.id === id)) selectedProductIds.delete(id);
  });

  if (!filteredProducts.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-table">No hay productos con los filtros actuales.</td></tr>`;
    updateBulkProductUI(filteredProducts);
    return;
  }

  if (productFilters.group === "none") {
    filteredProducts.forEach((p) => body.appendChild(renderProductRow(p)));
  } else {
    const groups = new Map();
    filteredProducts.forEach((p) => {
      const label = getProductGroupLabel(p);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(p);
    });

    groups.forEach((items, label) => {
      const collapsed = collapsedProductGroups.has(label);
      const groupRow = document.createElement("tr");
      groupRow.className = collapsed ? "group-row is-collapsed" : "group-row";
      groupRow.innerHTML = `
        <td colspan="8">
          <button type="button" class="group-toggle" data-group="${escapeHTML(label)}" aria-expanded="${collapsed ? "false" : "true"}">
            <span class="group-chevron">${collapsed ? "▸" : "▾"}</span>
            <span class="group-title">${escapeHTML(label)}</span>
            <span class="group-count">${items.length} producto${items.length === 1 ? "" : "s"}</span>
          </button>
        </td>`;
      body.appendChild(groupRow);

      if (!collapsed) {
        items.forEach((p) => body.appendChild(renderProductRow(p)));
      }
    });
  }

  body.querySelectorAll(".group-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const label = btn.dataset.group;
      if (collapsedProductGroups.has(label)) collapsedProductGroups.delete(label);
      else collapsedProductGroups.add(label);
      renderProductsTable(productsCache);
    });
  });

  body.querySelectorAll(".product-row-check").forEach((check) => {
    check.addEventListener("change", (e) => {
      if (e.target.checked) selectedProductIds.add(e.target.dataset.id);
      else selectedProductIds.delete(e.target.dataset.id);
      updateBulkProductUI(getFilteredProducts(productsCache));
    });
  });
  body.querySelectorAll(".edit-prod").forEach((btn) =>
    btn.addEventListener("click", () => editProduct(btn.dataset.id))
  );
  body.querySelectorAll(".delete-prod").forEach((btn) =>
    btn.addEventListener("click", () => deleteProduct(btn.dataset.id))
  );
  body.querySelectorAll(".toggle-stock").forEach((btn) =>
    btn.addEventListener("click", () => toggleStock(btn.dataset.id))
  );

  updateBulkProductUI(filteredProducts);
}

async function bulkUpdateProductStatus(status) {
  const ids = Array.from(selectedProductIds);
  if (!ids.length) { showToast("Selecciona al menos un producto"); return; }

  const { error } = await supabaseClient.from("products").update({ status }).in("id", ids);
  if (error) { showToast("No se pudo actualizar la selección"); return; }

  selectedProductIds.clear();
  await loadProducts();
  showToast(`Productos marcados como ${status}`);
}

async function bulkDeleteProducts() {
  const ids = Array.from(selectedProductIds);
  if (!ids.length) { showToast("Selecciona al menos un producto"); return; }
  if (!confirm(`¿Eliminar ${ids.length} producto${ids.length === 1 ? "" : "s"}? También se eliminarán sus variaciones.`)) return;

  const { error } = await supabaseClient.from("products").delete().in("id", ids);
  if (error) { showToast("No se pudo eliminar la selección"); return; }

  selectedProductIds.clear();
  await loadProducts();
  showToast("Productos eliminados");
}

function setProductImagePreview(url = "") {
  const preview = document.getElementById("productImgPreview");
  const clearBtn = document.getElementById("clearProductImage");

  if (url) {
    preview.src = url;
    preview.classList.remove("hidden");
    clearBtn?.classList.remove("hidden");
  } else {
    preview.src = "";
    preview.classList.add("hidden");
    clearBtn?.classList.add("hidden");
  }
}

document.getElementById("productImageFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const previousImageUrl = document.getElementById("productImageUrl").value || "";
  setProductImagePreview(URL.createObjectURL(file));

  const errorEl = document.getElementById("productError");
  errorEl.textContent = "Subiendo imagen...";

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("product-images")
    .upload(fileName, file);

  if (uploadError) {
    errorEl.textContent = "No se pudo subir la imagen.";
    setProductImagePreview(previousImageUrl);
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  document.getElementById("productImageUrl").value = publicUrlData.publicUrl;

  if (previousImageUrl && previousImageUrl !== publicUrlData.publicUrl) {
    await removeImageFromStorage(previousImageUrl);
  }

  errorEl.textContent = "";
  showToast("Foto del producto actualizada");
});

document.getElementById("clearProductImage")?.addEventListener("click", async () => {
  const currentUrl = document.getElementById("productImageUrl").value || "";
  if (!currentUrl) return;

  if (!confirm("¿Quitar esta foto del producto? Se intentará borrar también del storage.")) return;

  const errorEl = document.getElementById("productError");
  errorEl.textContent = "Quitando foto del producto...";

  const result = await removeImageFromStorage(currentUrl);
  if (!result.ok) {
    errorEl.textContent = "No se pudo borrar el archivo del storage. La foto no se quitó.";
    return;
  }

  document.getElementById("productImageUrl").value = "";
  document.getElementById("productImageFile").value = "";
  setProductImagePreview("");
  errorEl.textContent = "";
  showToast("Foto del producto quitada");
});

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("productError");
  errorEl.textContent = "";

  const id = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("productName").value.trim(),
    category_id: document.getElementById("productCategory").value || null,
    price: document.getElementById("productPrice").value
      ? Number(document.getElementById("productPrice").value)
      : null,
    status: document.getElementById("productStatus").value,
    description: document.getElementById("productDescription").value.trim() || null,
    image_url: document.getElementById("productImageUrl").value || null,
  };

  let savedProductId = id;
  let result;
  if (id) {
    result = await supabaseClient.from("products").update(payload).eq("id", id).select("id").single();
  } else {
    result = await supabaseClient.from("products").insert(payload).select("id").single();
  }

  if (result.error) {
    errorEl.textContent = "No se pudo guardar el producto.";
    return;
  }

  savedProductId = result.data.id;
  const variantsSaved = await saveProductVariants(savedProductId);
  if (!variantsSaved) {
    errorEl.textContent = "El producto se guardó, pero no se pudieron guardar las variaciones.";
    await loadProducts();
    return;
  }

  resetProductForm();
  await loadProducts();
  showToast("Producto guardado");
});

async function editProduct(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  document.getElementById("productId").value = p.id;
  document.getElementById("productName").value = p.name;
  document.getElementById("productCategory").value = p.category_id || "";
  document.getElementById("productPrice").value = p.price ?? "";
  document.getElementById("productStatus").value = p.status;
  document.getElementById("productDescription").value = p.description || "";
  document.getElementById("productImageUrl").value = p.image_url || "";

  setProductImagePreview(p.image_url || "");

  await loadVariantsForProduct(p.id);

  document.getElementById("productFormTitle").textContent = "Editar producto";
  document.getElementById("cancelProductEdit").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetProductForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("productImageUrl").value = "";
  setProductImagePreview("");
  document.getElementById("productFormTitle").textContent = "Agregar producto";
  document.getElementById("cancelProductEdit").classList.add("hidden");
  productVariantsDraft = [];
  renderProductVariantsEditor();
}

document.getElementById("cancelProductEdit").addEventListener("click", resetProductForm);

async function toggleStock(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  const newStatus = p.status === "disponible" ? "agotado" : "disponible";
  const { error } = await supabaseClient.from("products").update({ status: newStatus }).eq("id", id);
  if (error) { showToast("No se pudo actualizar"); return; }
  await loadProducts();
  showToast(`Marcado como ${newStatus}`);
}

async function deleteProduct(id) {
  if (!confirm("¿Eliminar este producto? También se eliminarán sus variaciones.")) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) { showToast("No se pudo eliminar"); return; }
  await loadProducts();
  showToast("Producto eliminado");
}

// =========================================================
// VARIACIONES DE PRODUCTO
// =========================================================
function renderColorPresetButtons() {
  const box = document.getElementById("colorPresetButtons");
  if (!box) return;
  box.innerHTML = COLOR_PRESETS.map((color) => `
    <button type="button" class="preset-color-btn" data-name="${escapeHTML(color.name)}" data-hex="${color.hex}">
      <svg class="color-chip-svg" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="${escapeHTML(color.hex)}"></circle></svg>${escapeHTML(color.name)}
    </button>
  `).join("");

  box.querySelectorAll(".preset-color-btn").forEach((btn) => {
    btn.addEventListener("click", () => addVariant({
      variant_name: btn.dataset.name,
      color_hex: btn.dataset.hex
    }));
  });
}

document.getElementById("addCustomVariant")?.addEventListener("click", () => {
  addVariant({ variant_name: "Nuevo tono", color_hex: "#D4AF37" });
});

function createVariantDraft(data = {}) {
  return {
    tempId: data.tempId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: data.id || null,
    product_id: data.product_id || null,
    variant_name: data.variant_name || "",
    color_hex: normalizeHex(data.color_hex || "#C0C0C0"),
    image_url: data.image_url || "",
    status: data.status || "disponible",
    price: data.price ?? "",
    sku: data.sku || "",
    stock: data.stock ?? 0,
    sort_order: data.sort_order ?? productVariantsDraft.length
  };
}

function addVariant(data = {}) {
  productVariantsDraft.push(createVariantDraft(data));
  renderProductVariantsEditor();
}

function updateVariant(tempId, key, value) {
  productVariantsDraft = productVariantsDraft.map((variant) =>
    variant.tempId === tempId ? { ...variant, [key]: value } : variant
  );
}

function removeVariant(tempId) {
  productVariantsDraft = productVariantsDraft.filter((variant) => variant.tempId !== tempId);
  renderProductVariantsEditor();
}

function renderProductVariantsEditor() {
  const list = document.getElementById("variantList");
  if (!list) return;

  if (!productVariantsDraft.length) {
    list.innerHTML = `<p class="variant-empty">Sin variaciones. Usa los tonos rápidos o el botón personalizado.</p>`;
    return;
  }

  list.innerHTML = productVariantsDraft.map((variant, index) => `
    <div class="variant-card" data-temp-id="${variant.tempId}">
      <div class="variant-card-top">
        <div class="variant-card-title">
          <svg class="color-chip-svg" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="${escapeHTML(variant.color_hex)}"></circle></svg>
          <span>${escapeHTML(variant.variant_name || `Variación ${index + 1}`)}</span>
        </div>
        <button type="button" class="small-btn danger btn-danger-outline remove-variant">Eliminar</button>
      </div>
      <div class="variant-grid">
        <div class="field">
          <label>Nombre del tono</label>
          <input type="text" class="variant-name" value="${escapeHTML(variant.variant_name)}" placeholder="Ej. Rosa" />
        </div>
        <div class="field">
          <label>Color visual</label>
          <input type="color" class="variant-color" value="${escapeHTML(variant.color_hex)}" />
        </div>
        <div class="field">
          <label>Estatus</label>
          <select class="variant-status">
            <option value="disponible" ${variant.status === "disponible" ? "selected" : ""}>Disponible</option>
            <option value="agotado" ${variant.status === "agotado" ? "selected" : ""}>Agotado</option>
          </select>
        </div>
        <div class="field">
          <label>Orden</label>
          <input type="number" class="variant-sort" value="${Number(variant.sort_order) || 0}" />
        </div>
        <div class="field">
          <label>Precio opcional</label>
          <input type="number" class="variant-price" min="0" step="0.01" value="${variant.price ?? ""}" placeholder="Usa precio base" />
        </div>
        <div class="field">
          <label>Stock</label>
          <input type="number" class="variant-stock" min="0" step="1" value="${variant.stock ?? 0}" />
        </div>
        <div class="field">
          <label>SKU / código</label>
          <input type="text" class="variant-sku" value="${escapeHTML(variant.sku || "")}" placeholder="Opcional" />
        </div>
        <div class="field">
          <label>Foto del tono</label>
          <div class="variant-image-row">
            ${variant.image_url ? `<img class="img-preview" src="${variant.image_url}" alt="" /><button type="button" class="small-btn danger clear-variant-image">Quitar foto</button>` : `<span class="variant-empty">Sin foto</span>`}
            <input type="file" class="variant-image-file" accept="image/*" />
          </div>
        </div>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".variant-card").forEach((card) => {
    const tempId = card.dataset.tempId;
    card.querySelector(".remove-variant").addEventListener("click", () => removeVariant(tempId));
    card.querySelector(".variant-name").addEventListener("input", (e) => updateVariant(tempId, "variant_name", e.target.value));
    card.querySelector(".variant-color").addEventListener("input", (e) => updateVariant(tempId, "color_hex", e.target.value));
    card.querySelector(".variant-status").addEventListener("change", (e) => updateVariant(tempId, "status", e.target.value));
    card.querySelector(".variant-sort").addEventListener("input", (e) => updateVariant(tempId, "sort_order", Number(e.target.value) || 0));
    card.querySelector(".variant-price").addEventListener("input", (e) => updateVariant(tempId, "price", e.target.value));
    card.querySelector(".variant-stock").addEventListener("input", (e) => updateVariant(tempId, "stock", Number(e.target.value) || 0));
    card.querySelector(".variant-sku").addEventListener("input", (e) => updateVariant(tempId, "sku", e.target.value));
    card.querySelector(".clear-variant-image")?.addEventListener("click", () => clearVariantImage(tempId));
    card.querySelector(".variant-image-file").addEventListener("change", (e) => uploadVariantImage(e, tempId));
  });
}

async function clearVariantImage(tempId) {
  const variant = productVariantsDraft.find((item) => item.tempId === tempId);
  if (!variant || !variant.image_url) return;

  if (!confirm("¿Quitar esta foto de la variación? Se intentará borrar también del storage.")) return;

  const errorEl = document.getElementById("productError");
  errorEl.textContent = "Quitando imagen de variación...";

  const result = await removeImageFromStorage(variant.image_url);
  if (!result.ok) {
    errorEl.textContent = "No se pudo borrar el archivo del storage. La foto no se quitó.";
    return;
  }

  updateVariant(tempId, "image_url", "");
  renderProductVariantsEditor();
  errorEl.textContent = "";
  showToast("Foto de variación quitada");
}

async function uploadVariantImage(e, tempId) {
  const file = e.target.files[0];
  if (!file) return;

  const previousVariant = productVariantsDraft.find((item) => item.tempId === tempId);
  const previousImageUrl = previousVariant?.image_url || "";
  const errorEl = document.getElementById("productError");
  errorEl.textContent = "Subiendo imagen de variación...";

  const fileExt = file.name.split(".").pop();
  const fileName = `variants/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("product-images")
    .upload(fileName, file);

  if (uploadError) {
    errorEl.textContent = "No se pudo subir la imagen de la variación.";
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  updateVariant(tempId, "image_url", publicUrlData.publicUrl);

  if (previousImageUrl && previousImageUrl !== publicUrlData.publicUrl) {
    await removeImageFromStorage(previousImageUrl);
  }

  renderProductVariantsEditor();
  errorEl.textContent = "";
}

async function loadVariantsForProduct(productId) {
  const { data, error } = await supabaseClient
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (error) {
    productVariantsDraft = [];
    renderProductVariantsEditor();
    showToast("No se pudieron cargar las variaciones");
    return;
  }

  productVariantsDraft = (data || []).map(createVariantDraft);
  renderProductVariantsEditor();
}

async function saveProductVariants(productId) {
  const cleanVariants = productVariantsDraft
    .map((variant, index) => ({
      product_id: productId,
      variant_name: (variant.variant_name || "").trim(),
      color_hex: normalizeHex(variant.color_hex),
      image_url: variant.image_url || null,
      status: variant.status || "disponible",
      price: variant.price !== "" && variant.price != null ? Number(variant.price) : null,
      sku: (variant.sku || "").trim() || null,
      stock: Number(variant.stock) || 0,
      sort_order: Number(variant.sort_order) || index,
    }))
    .filter((variant) => variant.variant_name);

  const deleteResult = await supabaseClient
    .from("product_variants")
    .delete()
    .eq("product_id", productId);

  if (deleteResult.error) return false;

  if (!cleanVariants.length) return true;

  const insertResult = await supabaseClient
    .from("product_variants")
    .insert(cleanVariants);

  return !insertResult.error;
}

// =========================================================
// CONFIGURACIÓN DEL SITIO (WhatsApp)
// =========================================================
async function loadSettings() {
  const { data, error } = await supabaseClient.from("site_settings").select("*");
  if (error || !data) return;

  const map = {};
  data.forEach((row) => (map[row.key] = row.value));

  document.getElementById("whatsappNumber").value = map.whatsapp_number || "";
  document.getElementById("whatsappMessage").value = map.whatsapp_message || "";
}

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("settingsError");
  errorEl.textContent = "";

  const number = document.getElementById("whatsappNumber").value.trim();
  const message = document.getElementById("whatsappMessage").value.trim();

  const { error } = await supabaseClient
    .from("site_settings")
    .upsert([
      { key: "whatsapp_number", value: number },
      { key: "whatsapp_message", value: message },
    ]);

  if (error) {
    errorEl.textContent = "No se pudo guardar la configuración.";
    return;
  }

  showToast("Configuración guardada");
});

// ---------- START ----------
checkSession();
