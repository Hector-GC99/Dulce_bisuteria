// =========================================================
// Panel de administración DULCE
// Toda escritura requiere sesión activa (ver políticas RLS en Supabase).
// =========================================================

const loginView = document.getElementById("loginView");
const panelView = document.getElementById("panelView");
const toastEl = document.getElementById("toast");

let categoriesCache = [];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2400);
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
  });
});

// ---------- INIT ----------
async function initPanel() {
  await loadCategories();
  await loadProducts();
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

  categoriesCache = data;
  renderCategoriesTable(data);
  renderCategoryOptions(data);
}

function renderCategoriesTable(categories) {
  const body = document.getElementById("categoriesTableBody");
  body.innerHTML = "";
  categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cat.name}</td>
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
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("categoryError");
  errorEl.textContent = "";

  const id = document.getElementById("categoryId").value;
  const name = document.getElementById("categoryName").value.trim();
  const sort_order = Number(document.getElementById("categorySort").value) || 0;
  const slug = slugify(name);

  const payload = { name, slug, sort_order };

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
  document.getElementById("categoryFormTitle").textContent = "Editar categoría";
  document.getElementById("cancelCategoryEdit").classList.remove("hidden");
}

function resetCategoryForm() {
  document.getElementById("categoryForm").reset();
  document.getElementById("categoryId").value = "";
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
let productsCache = [];

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name)")
    .order("sort_order", { ascending: true });

  if (error) { showToast("Error al cargar productos"); return; }

  productsCache = data;
  renderProductsTable(data);
}

function renderProductsTable(products) {
  const body = document.getElementById("productsTableBody");
  body.innerHTML = "";
  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.image_url ? `<img src="${p.image_url}" alt="" />` : "—"}</td>
      <td>${p.name}</td>
      <td>${p.categories ? p.categories.name : "—"}</td>
      <td>${p.price != null ? "$" + Number(p.price).toFixed(2) : "—"}</td>
      <td><span class="badge ${p.status}">${p.status}</span></td>
      <td class="row-actions">
        <button data-id="${p.id}" class="edit-prod">Editar</button>
        <button data-id="${p.id}" class="toggle-stock">${p.status === "disponible" ? "Marcar agotado" : "Marcar disponible"}</button>
        <button data-id="${p.id}" class="danger delete-prod">Eliminar</button>
      </td>`;
    body.appendChild(tr);
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
}

document.getElementById("productImageFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById("productImgPreview");
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");

  const errorEl = document.getElementById("productError");
  errorEl.textContent = "Subiendo imagen...";

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

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

  document.getElementById("productImageUrl").value = publicUrlData.publicUrl;
  errorEl.textContent = "";
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

  let result;
  if (id) {
    result = await supabaseClient.from("products").update(payload).eq("id", id);
  } else {
    result = await supabaseClient.from("products").insert(payload);
  }

  if (result.error) {
    errorEl.textContent = "No se pudo guardar el producto.";
    return;
  }

  resetProductForm();
  await loadProducts();
  showToast("Producto guardado");
});

function editProduct(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  document.getElementById("productId").value = p.id;
  document.getElementById("productName").value = p.name;
  document.getElementById("productCategory").value = p.category_id || "";
  document.getElementById("productPrice").value = p.price ?? "";
  document.getElementById("productStatus").value = p.status;
  document.getElementById("productDescription").value = p.description || "";
  document.getElementById("productImageUrl").value = p.image_url || "";

  const preview = document.getElementById("productImgPreview");
  if (p.image_url) {
    preview.src = p.image_url;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }

  document.getElementById("productFormTitle").textContent = "Editar producto";
  document.getElementById("cancelProductEdit").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetProductForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("productImageUrl").value = "";
  document.getElementById("productImgPreview").classList.add("hidden");
  document.getElementById("productFormTitle").textContent = "Agregar producto";
  document.getElementById("cancelProductEdit").classList.add("hidden");
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
  if (!confirm("¿Eliminar este producto?")) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) { showToast("No se pudo eliminar"); return; }
  await loadProducts();
  showToast("Producto eliminado");
}

// ---------- START ----------
checkSession();
