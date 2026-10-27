// yoy.js — Logika Halaman Year on Year (YoY): Cabang & Produk (12 Bulan Terakhir)

let currentYoYBrand = "ASTAGA";
let currentYoYTab = "cabang";
let currentYoYProdView = "kategori";
let yoyRawData = null;

let chartCabangTrxInstance = null;
let chartCabangMemInstance = null;
let chartProdukTrxInstance = null;

// Custom DataLabels Plugin untuk Chart.js (Zero external dependencies)
const customDataLabelsPlugin = {
  id: "customDataLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const datasets = chart.data.datasets;

    datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((element, index) => {
        const val = dataset.data[index];
        if (val === null || val === undefined || isNaN(val) || val === 0) return;

        ctx.save();
        ctx.fillStyle = dataset.borderColor || "#1e293b";
        ctx.font = "600 10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        // Format angka (misal 2.007 atau 361)
        const formattedVal = Math.round(val).toLocaleString("id-ID");
        ctx.fillText(formattedVal, element.x, element.y - 5);
        ctx.restore();
      });
    });
  }
};

function switchYoYBrand(brand) {
  if (currentYoYBrand === brand) return;
  currentYoYBrand = brand;

  // Update UI tombol brand
  const btnAstaga = document.getElementById("btn-yoy-astaga");
  const btnOki = document.getElementById("btn-yoy-okipay");
  if (btnAstaga && btnOki) {
    btnAstaga.classList.toggle("active", brand === "ASTAGA");
    btnOki.classList.toggle("active", brand === "OKIPAY");
  }

  loadYoY(false);
}

function switchYoYTab(tab) {
  currentYoYTab = tab;

  const btnCabang = document.getElementById("tab-btn-cabang");
  const btnProduk = document.getElementById("tab-btn-produk");
  const secCabang = document.getElementById("yoy-content-cabang");
  const secProduk = document.getElementById("yoy-content-produk");

  if (btnCabang) btnCabang.classList.toggle("active", tab === "cabang");
  if (btnProduk) btnProduk.classList.toggle("active", tab === "produk");

  if (secCabang) secCabang.style.display = (tab === "cabang") ? "flex" : "none";
  if (secProduk) secProduk.style.display = (tab === "produk") ? "flex" : "none";

  // Re-render chart yang sesuai
  if (tab === "cabang") {
    renderCabangCharts();
  } else {
    renderProdukChart();
  }
}

function switchYoYProdView(view) {
  currentYoYProdView = view;

  const btnKat = document.getElementById("btn-sub-kategori");
  const btnOp = document.getElementById("btn-sub-operator");
  const titleEl = document.getElementById("yoy-prod-chart-title");

  if (btnKat) btnKat.classList.toggle("active", view === "kategori");
  if (btnOp) btnOp.classList.toggle("active", view === "operator");

  if (titleEl) {
    titleEl.textContent = (view === "kategori") 
      ? "Tren Daily Trx per Kategori Produk (12 Bulan Terakhir)"
      : "Tren Daily Trx per Operator Populer (12 Bulan Terakhir)";
  }

  renderProdukChart();
}

function renderCabangCharts() {
  if (!yoyRawData || !yoyRawData.data) return;

  const labels = yoyRawData.month_labels || [];
  const brandData = yoyRawData.data;

  // 1. Chart Cabang Trx
  const ctxTrx = document.getElementById("chart-yoy-cabang-trx");
  if (ctxTrx) {
    if (chartCabangTrxInstance) chartCabangTrxInstance.destroy();

    chartCabangTrxInstance = new Chart(ctxTrx, {
      type: "line",
      data: {
        labels: labels,
        datasets: brandData.cabang_trx || []
      },
      plugins: [customDataLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 22, right: 12, bottom: 8, left: 8 }
        },
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { size: 11, weight: "600" },
              padding: 14
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || "";
                const val = Math.round(context.parsed.y || 0).toLocaleString("id-ID");
                return ` ${label}: ${val} trx/hari`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11, weight: "600" } }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0, 0, 0, 0.05)" },
            ticks: {
              callback: function(val) {
                return Number(val).toLocaleString("id-ID");
              }
            }
          }
        }
      }
    });
  }

  // 2. Chart Cabang Mem
  const ctxMem = document.getElementById("chart-yoy-cabang-mem");
  if (ctxMem) {
    if (chartCabangMemInstance) chartCabangMemInstance.destroy();

    chartCabangMemInstance = new Chart(ctxMem, {
      type: "line",
      data: {
        labels: labels,
        datasets: brandData.cabang_mem || []
      },
      plugins: [customDataLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 22, right: 12, bottom: 8, left: 8 }
        },
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { size: 11, weight: "600" },
              padding: 14
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || "";
                const val = Number(context.parsed.y || 0).toFixed(1);
                return ` ${label}: ${val} member/hari`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11, weight: "600" } }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0, 0, 0, 0.05)" },
            ticks: {
              callback: function(val) {
                return Number(val).toLocaleString("id-ID");
              }
            }
          }
        }
      }
    });
  }
}

function renderProdukChart() {
  if (!yoyRawData || !yoyRawData.data) return;

  const labels = yoyRawData.month_labels || [];
  const brandData = yoyRawData.data;
  const datasets = (currentYoYProdView === "kategori") 
    ? (brandData.kategori || []) 
    : (brandData.operator || []);

  const ctxProd = document.getElementById("chart-yoy-produk-trx");
  if (!ctxProd) return;

  if (chartProdukTrxInstance) chartProdukTrxInstance.destroy();

  chartProdukTrxInstance = new Chart(ctxProd, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    plugins: [customDataLabelsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 24, right: 12, bottom: 8, left: 8 }
      },
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            font: { size: 11, weight: "600" },
            padding: 14
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || "";
              const val = Math.round(context.parsed.y || 0).toLocaleString("id-ID");
              return ` ${label}: ${val} trx/hari`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: "600" } }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: {
            callback: function(val) {
              return Number(val).toLocaleString("id-ID");
            }
          }
        }
      }
    }
  });
}

async function loadYoY(force = false) {
  const labelEl = document.getElementById("yoy-period-label");

  try {
    const res = await fetch(`/api/yoy?brand=${currentYoYBrand}&force=${force ? '1' : '0'}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json && json.ok && json.data) {
      yoyRawData = json;

      if (labelEl && json.month_labels && json.month_labels.length > 0) {
        const firstM = json.month_labels[0];
        const lastM = json.month_labels[json.month_labels.length - 1];
        labelEl.textContent = `Rentang 12 Bulan: ${firstM} s/d ${lastM} (Bulan Berjalan)`;
      }

      if (currentYoYTab === "cabang") {
        renderCabangCharts();
      } else {
        renderProdukChart();
      }
    } else {
      throw new Error(json.error || "Gagal memuat dataset YoY");
    }
  } catch (err) {
    console.error("[YoY Error]:", err);
    if (labelEl) {
      labelEl.textContent = `Gagal memuat data: ${err.message}`;
    }
  }
}

// Global exports
window.loadYoY = loadYoY;
window.switchYoYBrand = switchYoYBrand;
window.switchYoYTab = switchYoYTab;
window.switchYoYProdView = switchYoYProdView;
