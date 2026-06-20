document.addEventListener("DOMContentLoaded", () => {
  const filterButtons = document.querySelectorAll(".filter-btn");
  const products = document.querySelectorAll(".product-card");

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;

      filterButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      products.forEach((product) => {
        const category = product.dataset.category;
        const shouldShow = filter === "todos" || category === filter;
        product.classList.toggle("is-hidden", !shouldShow);
      });
    });
  });
});
