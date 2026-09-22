// Book OCR Studio loader. Production source of truth is script.js.
(() => {
  const script = document.createElement("script");
  script.src = "./script.js?v=231";
  script.async = false;
  script.onerror = () => console.error("Book OCR Studio loader failed to load script.js");
  document.head.appendChild(script);
})();
