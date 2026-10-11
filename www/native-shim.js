/*
 * native-shim.js — dipasang otomatis oleh html2apk.py ke index.html.
 * Di dalam APK (WebView), link <a download href="blob:..."> tidak menyimpan file.
 * Shim ini menangkapnya, menulis file ke cache lewat Capacitor Filesystem,
 * lalu membuka menu Share Android (Simpan ke File / WhatsApp / Drive, dst).
 * Di browser biasa (bukan APK) shim ini tidak melakukan apa-apa.
 */
(function () {
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;

  function plugins() { return (window.Capacitor && window.Capacitor.Plugins) || {}; }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function saveAndShare(blob, name) {
    var P = plugins();
    if (!P.Filesystem || !P.Share) { alert("Plugin simpan file tidak tersedia."); return Promise.resolve(); }
    return blobToBase64(blob).then(function (b64) {
      return P.Filesystem.writeFile({ path: name, data: b64, directory: "CACHE", recursive: true });
    }).then(function (res) {
      return P.Share.share({ title: name, url: res.uri, dialogTitle: "Simpan / bagikan " + name });
    }).catch(function (e) {
      // pengguna menutup menu Share = bukan error
      if (e && /cancel/i.test(String(e.message || e))) return;
      console.error("native-shim:", e);
      alert("Gagal menyimpan file: " + (e && e.message ? e.message : e));
    });
  }

  function intercept(a) {
    var href = a.href || "";
    if (!a.hasAttribute("download") || !/^(blob:|data:)/.test(href)) return false;
    var name = a.getAttribute("download") || "file";
    fetch(href).then(function (r) { return r.blob(); }).then(function (b) { return saveAndShare(b, name); });
    return true;
  }

  // klik manual pada <a download>
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[download]") : null;
    if (a && intercept(a)) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // klik programatik: a.click() pada elemen yang tidak ada di DOM (pola umum untuk export)
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (intercept(this)) return;
    return origClick.apply(this, arguments);
  };
})();
