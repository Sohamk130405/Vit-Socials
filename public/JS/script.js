// Step 1: Store Scroll Position on Page Unload
window.addEventListener("beforeunload", () => {
    const scrollPosition = window.scrollY || window.pageYOffset;
    localStorage.setItem("scrollPosition", scrollPosition);
  });
  
  // Step 2: Retrieve Scroll Position on Page Load
  window.addEventListener("load", () => {
    const scrollPosition = localStorage.getItem("scrollPosition");
    if (scrollPosition !== null) {
      window.scrollTo(0, parseInt(scrollPosition, 10));
      localStorage.removeItem("scrollPosition"); // Optional: Clear the stored position
    }
  });