/**
 * FLEX VISUAL MANAGEMENT & SIGNAGE SYSTEM
 * Core Application Controller - Version 2.5
 * Auto-TitleCase & Exact Straight-Corner Guillotine Standard
 */

class FlexSignageApp {
  constructor() {
    this.storageKey = 'flex_signage_orders_v4';
    this.currentCategory = 'station';
    this.flowDirection = 'lr';
    this.activeFilter = 'all';
    this.searchTerm = '';
    this.currentSuccessOrder = null;
    this.orders = [];
    this.binPhotoDataUrl = null;
    this.cartItems = [];

    this.init();
  }

  init() {
    this.loadOrders();
    this.setupListeners();
    this.setupCrossTabSync();
    this.refreshLivePreview();
    this.renderCart();
    this.renderKanban();
    this.renderTrackingRecent();
    this.updateMetrics();
  }

  /* ========================================================================
     TEXT CAPITALIZATION (TITLE CASE) HELPER
     Primera letra mayúscula y las demás minúsculas siempre
     ======================================================================== */
  toTitleCase(str) {
    if (!str || typeof str !== 'string') return '';
    
    // Siglas industriales de Flex que deben mantenerse en mayúsculas
    const acronyms = new Set([
      'SMT', 'AOI', 'ICT', 'FCT', 'PTH', 'PCB', 'PCBA', 'ESD', 'RF', 'IST',
      'QA', 'QC', 'P/N', 'PN', 'CPU', 'RAM', 'USB', 'LED', 'LCD', 'DIP',
      'BGA', 'QFP', 'SOP', 'THT', 'SPI', 'AXI', 'MES', 'OEE', 'FIFO'
    ]);

    return str.trim().split(/\s+/).map((word) => {
      if (!word) return '';

      // Partes separadas por guión (ej: P/N-1049, C-14, L-3)
      if (word.includes('-')) {
        return word.split('-').map(part => {
          const cleanUpper = part.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (acronyms.has(cleanUpper)) return part.toUpperCase();
          if (!part) return '';
          return part.replace(/^([^a-zA-ZáéíóúÁÉÍÓÚñÑ]*)([a-zA-ZáéíóúÁÉÍÓÚñÑ])(.*)$/, (_, pre, first, rest) => {
            return pre + first.toUpperCase() + rest.toLowerCase();
          });
        }).join('-');
      }

      // Verificar si es sigla conocida
      const cleanUpper = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (acronyms.has(cleanUpper)) {
        return word.toUpperCase();
      }

      // Primera letra alfabética mayúscula, resto en minúsculas
      return word.replace(/^([^a-zA-ZáéíóúÁÉÍÓÚñÑ]*)([a-zA-ZáéíóúÁÉÍÓÚñÑ])(.*)$/, (_, pre, first, rest) => {
        return pre + first.toUpperCase() + rest.toLowerCase();
      });
    }).join(' ');
  }

  /* ========================================================================
     BIN PHOTO & BARCODE / QR HELPERS (Estándar Oficial Flex)
     ======================================================================== */
  handleBinPhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      this.binPhotoDataUrl = evt.target.result;
      const clearBtn = document.getElementById('bin-photo-clear-btn');
      if (clearBtn) clearBtn.style.display = 'inline-block';
      this.refreshLivePreview();
    };
    reader.readAsDataURL(file);
  }

  clearBinPhoto() {
    this.binPhotoDataUrl = null;
    const input = document.getElementById('bin-photo-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('bin-photo-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    this.refreshLivePreview();
  }

  generateBarcodeSvg(text) {
    const clean = (text || 'TYEH-1144337_00-BW').toUpperCase();
    let bars = [2, 1, 2, 1];
    for (let i = 0; i < clean.length; i++) {
      const c = clean.charCodeAt(i);
      const b1 = (c % 3) + 1;
      const b2 = ((c >> 2) % 3) + 1;
      const b3 = ((c >> 4) % 2) + 1;
      bars.push(b1, 1, b2, 2, b3, 1);
    }
    bars.push(2, 1, 2, 2, 1);

    let x = 2;
    let rects = '';
    for (let i = 0; i < bars.length; i++) {
      const w = bars[i];
      if (i % 2 === 0) {
        rects += `<rect x="${x}" y="0" width="${w}" height="28" fill="#000000" />`;
      }
      x += w;
    }
    const totalW = x + 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} 28" width="100%" height="26" preserveAspectRatio="none">${rects}</svg>`;
  }

  generateBarcodeDataUrl(text) {
    const clean = (text || 'TYEH-1144337_00-BW').toUpperCase();
    const canvas = document.createElement('canvas');
    let bars = [2, 1, 2, 1];
    for (let i = 0; i < clean.length; i++) {
      const c = clean.charCodeAt(i);
      const b1 = (c % 3) + 1;
      const b2 = ((c >> 2) % 3) + 1;
      const b3 = ((c >> 4) % 2) + 1;
      bars.push(b1, 1, b2, 2, b3, 1);
    }
    bars.push(2, 1, 2, 2, 1);

    let totalW = bars.reduce((a, b) => a + b, 0) * 2 + 8;
    canvas.width = totalW;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, 40);
    ctx.fillStyle = '#000000';
    let x = 4;
    for (let i = 0; i < bars.length; i++) {
      const w = bars[i] * 2;
      if (i % 2 === 0) {
        ctx.fillRect(x, 2, w, 36);
      }
      x += w;
    }
    return canvas.toDataURL('image/png');
  }

  getQrMatrix(text) {
    const size = 21;
    const matrix = Array.from({ length: size }, () => Array(size).fill(0));
    const drawFinder = (sr, sc) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            matrix[sr + r][sc + c] = 1;
          }
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }
    let hash = 0;
    const str = String(text || 'TYEH-1144337_00-BW');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder1 = (r < 8 && c < 8);
        const inFinder2 = (r < 8 && c >= size - 8);
        const inFinder3 = (r >= size - 8 && c < 8);
        const isTiming = (r === 6 || c === 6);
        if (!inFinder1 && !inFinder2 && !inFinder3 && !isTiming) {
          matrix[r][c] = ((hash ^ (r * 31 + c * 17)) & 1);
        }
      }
    }
    return matrix;
  }

  generateQrSvg(text) {
    const matrix = this.getQrMatrix(text);
    const size = matrix.length;
    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#000000" />`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="28" height="28"><rect width="${size}" height="${size}" fill="#ffffff"/>${rects}</svg>`;
  }

  generateQrDataUrl(text) {
    const matrix = this.getQrMatrix(text);
    const size = matrix.length;
    const scale = 5;
    const canvas = document.createElement('canvas');
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
    return canvas.toDataURL('image/png');
  }

  /* ========================================================================
     DATA & STATE MANAGEMENT
     ======================================================================== */
  loadOrders() {
    const data = localStorage.getItem(this.storageKey);
    if (data) {
      try {
        this.orders = JSON.parse(data);
      } catch (e) {
        console.error('Error loading orders', e);
        this.loadSampleData();
      }
    } else {
      this.loadSampleData();
    }
  }

  saveOrders() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.orders));
    this.renderKanban();
    this.renderTrackingRecent();
    this.updateMetrics();
    this.broadcastUpdate();
  }

  loadSampleData() {
    const now = new Date();
    const subHours = (h) => new Date(now.getTime() - h * 3600000).toISOString();

    this.orders = [
      {
        id: 'FLX-1001',
        category: 'station',
        stationType: 'flow',
        nameEn: 'Solder Paste Inspection',
        nameEs: 'Inspección De Pasta De Soldadura',
        prevProcess: 'Screen Printer SMT',
        nextProcess: 'Pick And Place High Speed',
        flowDirection: 'lr',
        isCritical: true,
        isSeated: false,
        copies: 4,
        lineArea: 'Línea 3 - SMT Automotriz',
        requester: {
          name: 'Fernando Ramos',
          email: 'fernando.ramos@flex.com',
          priority: 'Urgente',
          notes: 'Requerido para auditoría este martes.'
        },
        status: 'process',
        processes: [
          { name: 'Impresión', completed: true },
          { name: 'Enmicado', completed: true },
          { name: 'Corte', completed: false }
        ],
        createdAt: subHours(2)
      },
      {
        id: 'FLX-1002',
        category: 'bin',
        binType: 'minmax',
        partNumber: '104-8923-01',
        commonName: 'Capacitor SMD 0402 10uF',
        minVal: '50',
        maxVal: '200',
        rpVal: '80',
        qty: 8,
        lineArea: 'Línea 1 SMT',
        requester: {
          name: 'Laura Treviño',
          email: 'laura.trevino@flex.com',
          priority: 'Normal',
          notes: 'Tarjetas para bines de línea.'
        },
        status: 'pending',
        processes: [
          { name: 'Impresión', completed: false },
          { name: 'Enmicado', completed: false },
          { name: 'Corte', completed: false }
        ],
        createdAt: subHours(1)
      },
      {
        id: 'FLX-1003',
        category: 'aerial',
        aerialName: 'Línea 4 - Subensamble Final',
        qty: 1,
        lineArea: 'Bahía 14 Nave 2',
        requester: {
          name: 'Carlos Mendoza',
          email: 'carlos.mendoza@flex.com',
          priority: 'Normal',
          notes: ''
        },
        status: 'process',
        processes: [
          { name: 'Corte de vinil', completed: true },
          { name: 'Colocación de papel transfer', completed: false },
          { name: 'Realización de letrero', completed: false }
        ],
        createdAt: subHours(5)
      },
      {
        id: 'FLX-1004',
        category: 'laptop',
        laptopName: 'Roberto Domínguez',
        qty: 1,
        lineArea: 'Escritorio IT - Planta 1',
        requester: {
          name: 'Roberto Domínguez',
          email: 'roberto.dominguez@flex.com',
          priority: 'Normal',
          notes: 'Laptop nueva.'
        },
        status: 'ready',
        processes: [
          { name: 'Corte de vinil', completed: true },
          { name: 'Colocación de papel transfer', completed: true }
        ],
        createdAt: subHours(18)
      }
    ];

    this.saveOrders();
  }

  setupCrossTabSync() {
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.loadOrders();
        this.renderKanban();
        this.renderTrackingRecent();
        this.updateMetrics();
      }
    });

    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('flex_signage_channel');
      this.channel.onmessage = (event) => {
        if (event.data && event.data.type === 'REFRESH_ORDERS') {
          this.loadOrders();
          this.renderKanban();
          this.renderTrackingRecent();
          this.updateMetrics();
        }
      };
    }
  }

  broadcastUpdate() {
    if (this.channel) {
      this.channel.postMessage({ type: 'REFRESH_ORDERS' });
    }
  }

  setupListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
      }
    });

    // Auto-formateo a Title Case (Primera Letra Mayúscula, Resto Minúsculas) al salir de los campos
    const titleCaseInputs = [
      'station-name-en', 'station-name-es', 'flow-prev-process', 'flow-next-process',
      'bin-common-name', 'scrap-line', 'slot-rack-name',
      'traveler-area', 'traveler-manager', 'traveler-origin', 'traveler-dest',
      'aerial-name-en', 'aerial-name-es', 'laptop-name', 'office-name', 'requester-name', 'order-line-area'
    ];

    titleCaseInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', (e) => {
          if (e.target.value) {
            e.target.value = this.toTitleCase(e.target.value);
            this.refreshLivePreview();
          }
        });
      }
    });
  }

  /* ========================================================================
     NAVIGATION & TABS
     ======================================================================== */
  switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabId}`);
    const targetBtn = document.getElementById(`nav-btn-${tabId}`);

    if (targetTab) targetTab.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'kanban') this.renderKanban();
    if (tabId === 'track') this.renderTrackingRecent();
    if (tabId === 'metrics') this.updateMetrics();
  }

  /* ========================================================================
     CATEGORY SELECTION & FORM DYNAMICS
     ======================================================================== */
  selectCategory(category) {
    this.currentCategory = category;

    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
    const activeCard = document.getElementById(`cat-card-${category}`);
    if (activeCard) activeCard.classList.add('selected');

    const containers = {
      station: document.getElementById('fields-station-container'),
      bin: document.getElementById('fields-bin-container'),
      scrap: document.getElementById('fields-scrap-container'),
      slot: document.getElementById('fields-slot-container'),
      traveler: document.getElementById('fields-traveler-container'),
      aerial: document.getElementById('fields-aerial-container'),
      laptop: document.getElementById('fields-laptop-container'),
      office: document.getElementById('fields-office-container')
    };

    const previews = {
      station: document.getElementById('preview-station-box'),
      bin: document.getElementById('preview-bin-box'),
      scrap: document.getElementById('preview-scrap-box'),
      slot: document.getElementById('preview-slot-box'),
      traveler: document.getElementById('preview-traveler-box'),
      aerial: document.getElementById('preview-aerial-box'),
      laptop: document.getElementById('preview-vinyl-box'),
      office: document.getElementById('preview-vinyl-box')
    };

    Object.values(containers).forEach(el => { if (el) el.style.display = 'none'; });
    Object.values(previews).forEach(el => { if (el) el.style.display = 'none'; });

    if (containers[category]) containers[category].style.display = 'block';
    if (previews[category]) previews[category].style.display = 'block';

    const heading = document.getElementById('form-category-heading');
    const badge = document.getElementById('form-category-badge');

    const titles = {
      station: { icon: '🏭', text: 'Identificación de Estación', badge: 'Estaciones' },
      bin: { icon: '📦', text: 'Identificación de Bin', badge: 'Bines' },
      scrap: { icon: '🗑️', text: 'Tarjeta de Scrap', badge: 'Scrap' },
      slot: { icon: '🔢', text: 'Número de Slot', badge: 'Slots' },
      traveler: { icon: '🛒', text: 'Carro / Rack Viajero', badge: 'Viajeros' },
      aerial: { icon: '🪧', text: 'Letrero Aéreo', badge: 'Aéreos' },
      laptop: { icon: '💻', text: 'Vinil para Laptop', badge: 'Laptop' },
      office: { icon: '🏢', text: 'Vinil de Oficina', badge: 'Oficina' }
    };

    if (titles[category]) {
      heading.innerHTML = `<span>${titles[category].icon}</span> ${titles[category].text}`;
      badge.textContent = titles[category].badge;
    }

    if (category === 'laptop') {
      document.getElementById('replica-vinyl-badge').textContent = 'Rotulación Laptop • Corte de Vinil';
    } else if (category === 'office') {
      document.getElementById('replica-vinyl-badge').textContent = 'Placa de Oficina • Vinil de Corte';
    }

    const pptxBtn = document.getElementById('btn-download-preview-pptx');
    if (pptxBtn) {
      const supportsPptx = ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(category);
      pptxBtn.style.display = supportsPptx ? 'inline-flex' : 'none';
    }

    this.refreshLivePreview();
  }

  updateStationType(type) {
    const flowFields = document.getElementById('flow-fields-group');
    if (flowFields) {
      flowFields.style.display = (type === 'standard') ? 'none' : 'block';
    }
    this.refreshLivePreview();
  }

  updateBinType(type) {
    const minMaxFields = document.getElementById('bin-minmax-fields');
    const commonNameGroup = document.getElementById('bin-common-name-group');
    if (minMaxFields) {
      minMaxFields.style.display = (type === 'minmax') ? 'block' : 'none';
    }
    if (commonNameGroup) {
      commonNameGroup.style.display = (type === 'simple') ? 'block' : 'none';
    }
    this.refreshLivePreview();
  }

  setFlowDirection(dir) {
    this.flowDirection = dir;
    const btnLr = document.getElementById('btn-flow-lr');
    const btnRl = document.getElementById('btn-flow-rl');
    if (btnLr) btnLr.classList.toggle('active', dir === 'lr');
    if (btnRl) btnRl.classList.toggle('active', dir === 'rl');
    this.refreshLivePreview();
  }

  toggleCheck(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.checked = !input.checked;
    this.onToggleCardChange(inputId.includes('critical') ? 'critical' : 'seated');
  }

  onToggleCardChange(type) {
    if (type === 'critical') {
      const isChecked = document.getElementById('check-is-critical')?.checked || false;
      document.getElementById('card-toggle-critical')?.classList.toggle('active', isChecked);
    } else {
      const isChecked = document.getElementById('check-is-seated')?.checked || false;
      document.getElementById('card-toggle-seated')?.classList.toggle('active', isChecked);
    }
    this.refreshLivePreview();
  }

  /* ========================================================================
     REAL-TIME WYSIWYG PREVIEW REPLICA
     Aplica automáticamente Title Case y estándares visuales de Flex
     ======================================================================== */
  refreshLivePreview() {
    if (this.currentCategory === 'station') {
      const rawEn = document.getElementById('station-name-en')?.value.trim() || 'Process Name';
      const rawEs = document.getElementById('station-name-es')?.value.trim() || 'Nombre de Proceso';
      const rawPrev = document.getElementById('flow-prev-process')?.value.trim() || 'Previous Process';
      const rawNext = document.getElementById('flow-next-process')?.value.trim() || 'Next Process';

      const nameEn = this.toTitleCase(rawEn);
      const nameEs = this.toTitleCase(rawEs);
      const prevProc = this.toTitleCase(rawPrev);
      const nextProc = this.toTitleCase(rawNext);
      const stationType = document.getElementById('station-sub-type')?.value || 'flow';

      const isCritical = document.getElementById('check-is-critical')?.checked || false;
      const isSeated = document.getElementById('check-is-seated')?.checked || false;

      const dimTag = document.getElementById('preview-station-dimension-tag');
      if (dimTag) {
        dimTag.textContent = (stationType === 'automatic') ? 'Dimensiones: 13.5 x 24.5 cm' : 'Dimensiones: 9 cm x 12.5 cm';
      }

      const txtEn = document.getElementById('replica-txt-en');
      const txtEs = document.getElementById('replica-txt-es');
      if (txtEn) txtEn.textContent = nameEn;
      if (txtEs) txtEs.textContent = nameEs;

      const imgSeated = document.getElementById('replica-img-seated');
      if (imgSeated) imgSeated.style.display = isSeated ? 'block' : 'none';

      const critGroup = document.getElementById('replica-critical-group');
      if (critGroup) critGroup.style.display = isCritical ? 'flex' : 'none';

      const flowGroup = document.getElementById('replica-flow-group');
      if (flowGroup) {
        if (stationType === 'standard') {
          flowGroup.style.display = 'none';
        } else {
          flowGroup.style.display = 'flex';
          const txtPrev = document.getElementById('replica-txt-prev');
          const txtNext = document.getElementById('replica-txt-next');
          const arrow = document.getElementById('replica-img-arrow');

          if (this.flowDirection === 'lr') {
            if (txtPrev) txtPrev.textContent = prevProc;
            if (txtNext) txtNext.textContent = nextProc;
            if (arrow) {
              arrow.classList.remove('point-left');
              arrow.classList.add('point-right');
            }
          } else {
            if (txtPrev) txtPrev.textContent = nextProc;
            if (txtNext) txtNext.textContent = prevProc;
            if (arrow) {
              arrow.classList.remove('point-right');
              arrow.classList.add('point-left');
            }
          }
        }
      }
    } else if (this.currentCategory === 'bin') {
      const pn = (document.getElementById('bin-part-number')?.value.trim() || 'TYEH-1144337_00-BW').toUpperCase();
      const rawDesc = document.getElementById('bin-common-name')?.value.trim() || 'Tornillo M4 x 12mm';
      const desc = this.toTitleCase(rawDesc);
      const binType = document.getElementById('bin-sub-type')?.value || 'simple';
      const binSize = document.getElementById('bin-size')?.value || '4x10';

      const sizeLabels = {
        '2x7': 'Dimensiones: 2 x 7 cm',
        '2.5x9': 'Dimensiones: 2.5 x 9 cm',
        '4x10': 'Dimensiones: 4 x 10 cm',
        '6x20': 'Dimensiones: 6 x 20 cm'
      };
      const dimTag = document.getElementById('preview-bin-dimension-tag');
      if (dimTag) dimTag.textContent = sizeLabels[binSize] || 'Dimensiones: 4 x 10 cm';

      const replicaCard = document.getElementById('bin-card-replica');
      if (replicaCard) {
        const aspectMap = {
          '2x7': '3.5 / 1',
          '2.5x9': '3.6 / 1',
          '4x10': '2.5 / 1',
          '6x20': '3.33 / 1'
        };
        replicaCard.style.aspectRatio = aspectMap[binSize] || '2.8 / 1';
      }

      const pnEl = document.getElementById('replica-bin-pn');
      if (pnEl) pnEl.textContent = pn;

      // Render barcode & QR
      const barcodeCont = document.getElementById('bin-barcode-container');
      if (barcodeCont) barcodeCont.innerHTML = this.generateBarcodeSvg(pn);

      const qrCont = document.getElementById('bin-qr-container');
      if (qrCont) qrCont.innerHTML = this.generateQrSvg(pn);

      // Photo handling
      const photoImg = document.getElementById('bin-photo-img');
      const photoFallback = document.getElementById('bin-photo-fallback');
      if (this.binPhotoDataUrl) {
        if (photoImg) {
          photoImg.src = this.binPhotoDataUrl;
          photoImg.style.display = 'block';
        }
        if (photoFallback) photoFallback.style.display = 'none';
      } else {
        if (photoImg) photoImg.style.display = 'none';
        if (photoFallback) photoFallback.style.display = 'flex';
      }

      const descBar = document.getElementById('replica-bin-desc-bar');
      const metricsBar = document.getElementById('replica-bin-metrics-bar');

      if (binType === 'minmax') {
        if (descBar) descBar.style.display = 'none';
        if (metricsBar) {
          metricsBar.style.display = 'flex';
          const minEl = document.getElementById('replica-bin-min-val');
          const maxEl = document.getElementById('replica-bin-max-val');
          const rpEl = document.getElementById('replica-bin-rp-val');
          if (minEl) minEl.textContent = document.getElementById('bin-min')?.value || '20';
          if (maxEl) maxEl.textContent = document.getElementById('bin-max')?.value || '150';
          if (rpEl) rpEl.textContent = document.getElementById('bin-rp')?.value || '50';
        }
      } else {
        if (metricsBar) metricsBar.style.display = 'none';
        if (descBar) {
          descBar.style.display = 'flex';
          const nameTxt = document.getElementById('replica-bin-common-name-txt');
          if (nameTxt) nameTxt.textContent = desc;
        }
      }
    } else if (this.currentCategory === 'scrap') {
      const scrapSize = document.getElementById('scrap-size')?.value || '9x12.5';
      const sizeLabels = {
        '2x7': 'Dimensiones: 2 x 7 cm',
        '2.5x9': 'Dimensiones: 2.5 x 9 cm',
        '4x10': 'Dimensiones: 4 x 10 cm',
        '6x20': 'Dimensiones: 6 x 20 cm',
        '9x12.5': 'Dimensiones: 9 x 12.5 cm'
      };
      const dimTag = document.getElementById('preview-scrap-dimension-tag');
      if (dimTag) dimTag.textContent = sizeLabels[scrapSize] || 'Dimensiones: 9 x 12.5 cm';
    } else if (this.currentCategory === 'slot') {
      const num = document.getElementById('slot-number')?.value.trim() || '1';
      const slotNumEl = document.getElementById('replica-slot-num');
      if (slotNumEl) slotNumEl.textContent = num;
    } else if (this.currentCategory === 'traveler') {
      const type = document.getElementById('traveler-type')?.value || 'Carro';
      const typeTag = document.getElementById('replica-traveler-type');
      if (typeTag) typeTag.textContent = type;

      const originRow = document.getElementById('replica-traveler-origin-row');
      const footerNote = document.getElementById('replica-traveler-footer-note');

      if (type === 'Rack') {
        if (originRow) originRow.style.display = 'none';
        if (footerNote) footerNote.textContent = 'Solo usar en racks destinados a almacenamiento de WIP';
      } else {
        if (originRow) originRow.style.display = 'flex';
        if (footerNote) footerNote.textContent = 'Solo usar en carros para transporte de WIP';
      }
    } else if (this.currentCategory === 'aerial') {
      const aerialEn = this.toTitleCase(document.getElementById('aerial-name-en')?.value.trim() || 'PCR Lines');
      const aerialEs = this.toTitleCase(document.getElementById('aerial-name-es')?.value.trim() || 'Lineas de PCR');
      const aerialTxt = document.getElementById('replica-aerial-text');
      const sub = document.getElementById('replica-aerial-sub');
      if (aerialTxt) aerialTxt.textContent = aerialEn;
      if (sub) sub.textContent = aerialEs;
    } else if (this.currentCategory === 'laptop') {
      const laptopName = this.toTitleCase(document.getElementById('laptop-name')?.value.trim() || 'Nombre y Apellido');
      const vinylTxt = document.getElementById('replica-vinyl-text');
      if (vinylTxt) vinylTxt.textContent = laptopName;
    } else if (this.currentCategory === 'office') {
      const officeName = this.toTitleCase(document.getElementById('office-name')?.value.trim() || 'Nombre y Apellido');
      const vinylTxt = document.getElementById('replica-vinyl-text');
      if (vinylTxt) vinylTxt.textContent = officeName;
    }
  }

  /* ========================================================================
     MULTI-ITEM ORDER CART (VARIAS IDENTIFICACIONES POR TICKET)
     ======================================================================== */
  captureCurrentItem() {
    const cat = this.currentCategory;
    let item = {
      category: cat,
      addedAt: new Date().toISOString()
    };

    if (cat === 'station') {
      const subType = document.getElementById('station-sub-type')?.value || 'flow';
      const nameEn = this.toTitleCase(document.getElementById('station-name-en')?.value.trim() || '');
      const nameEs = this.toTitleCase(document.getElementById('station-name-es')?.value.trim() || '');
      const prevProc = this.toTitleCase(document.getElementById('flow-prev-process')?.value.trim() || 'Previous Process');
      const nextProc = this.toTitleCase(document.getElementById('flow-next-process')?.value.trim() || 'Next Process');
      const copies = parseInt(document.getElementById('station-copies')?.value) || 4;
      const isCritical = document.getElementById('check-is-critical')?.checked || false;
      const isSeated = document.getElementById('check-is-seated')?.checked || false;
      const stationSize = (subType === 'automatic') ? '13.5x24.5' : '9x12.5';

      item.stationType = subType;
      item.stationSize = stationSize;
      item.nameEn = nameEn;
      item.nameEs = nameEs;
      item.prevProcess = prevProc;
      item.nextProcess = nextProc;
      item.flowDirection = this.flowDirection;
      item.isCritical = isCritical;
      item.isSeated = isSeated;
      item.copies = copies;
      item.qty = copies;
      item.icon = '🏭';
      item.title = nameEn || 'Estación de Trabajo';
      item.subtitle = `${nameEs} • ${stationSize} cm • ${subType === 'automatic' ? 'Línea Automática' : (subType === 'standard' ? 'Sin Flujo' : 'Con Flujo')}`;

    } else if (cat === 'bin') {
      const binSize = document.getElementById('bin-size')?.value || '4x10';
      const subType = document.getElementById('bin-sub-type')?.value || 'simple';
      const pn = (document.getElementById('bin-part-number')?.value.trim() || '').toUpperCase();
      const commonName = this.toTitleCase(document.getElementById('bin-common-name')?.value.trim() || '');
      const minVal = document.getElementById('bin-min')?.value.trim() || '20';
      const maxVal = document.getElementById('bin-max')?.value.trim() || '150';
      const rpVal = document.getElementById('bin-rp')?.value.trim() || '50';
      const qty = parseInt(document.getElementById('bin-qty')?.value) || 8;

      item.binSize = binSize;
      item.binType = subType;
      item.partNumber = pn;
      item.commonName = commonName || 'Material';
      item.minVal = minVal;
      item.maxVal = maxVal;
      item.rpVal = rpVal;
      item.photoDataUrl = this.binPhotoDataUrl || null;
      item.qty = qty;
      item.icon = '📦';
      item.title = pn || 'Bin de Material';
      item.subtitle = `${subType === 'minmax' ? `Min-Max (${minVal}/${maxVal}/${rpVal})` : (commonName || 'Material')} • ${binSize} cm`;

    } else if (cat === 'scrap') {
      const scrapSize = document.getElementById('scrap-size')?.value || '9x12.5';
      const scrapLine = this.toTitleCase(document.getElementById('scrap-line')?.value.trim() || 'Planta General');
      const qty = parseInt(document.getElementById('scrap-qty')?.value) || 2;

      item.scrapSize = scrapSize;
      item.scrapLine = scrapLine;
      item.qty = qty;
      item.icon = '🗑️';
      item.title = `Tarjeta de Scrap (${scrapSize} cm)`;
      item.subtitle = `Línea: ${scrapLine}`;

    } else if (cat === 'slot') {
      const slotNum = document.getElementById('slot-number')?.value.trim() || '1';
      const rackName = this.toTitleCase(document.getElementById('slot-rack-name')?.value.trim() || 'RACK IST');
      const qty = parseInt(document.getElementById('slot-qty')?.value) || 3;

      item.slotNumber = slotNum;
      item.rackName = rackName;
      item.qty = qty;
      item.icon = '🔢';
      item.title = `Slot #${slotNum}`;
      item.subtitle = `Rack: ${rackName}`;

    } else if (cat === 'traveler') {
      const travelerType = document.getElementById('traveler-type')?.value || 'Carro';
      const qty = parseInt(document.getElementById('traveler-qty')?.value) || 4;

      item.travelerType = travelerType;
      item.travelerSize = '9x12.5';
      item.isReusableTemplate = true;
      item.qty = qty;
      item.icon = '🛒';
      item.title = `${travelerType} en Flujo WIP (9x12.5 cm)`;
      item.subtitle = 'Plantilla estándar para llenado manual';

    } else if (cat === 'aerial') {
      const aerialEn = this.toTitleCase(document.getElementById('aerial-name-en')?.value.trim() || '');
      const aerialEs = this.toTitleCase(document.getElementById('aerial-name-es')?.value.trim() || '');
      const qty = parseInt(document.getElementById('aerial-qty')?.value) || 1;

      item.aerialNameEn = aerialEn;
      item.aerialNameEs = aerialEs;
      item.qty = qty;
      item.icon = '🪧';
      item.title = `Letrero: ${aerialEn || 'Aéreo'}`;
      item.subtitle = aerialEs || 'Letrero de Acrílico';

    } else if (cat === 'laptop') {
      const lapName = this.toTitleCase(document.getElementById('laptop-name')?.value.trim() || '');
      const qty = parseInt(document.getElementById('laptop-qty')?.value) || 1;

      item.laptopName = lapName;
      item.qty = qty;
      item.icon = '💻';
      item.title = `Vinil Laptop: ${lapName || 'Personal'}`;
      item.subtitle = 'Vinil de corte personalizado';

    } else if (cat === 'office') {
      const offName = this.toTitleCase(document.getElementById('office-name')?.value.trim() || '');
      const deskId = this.toTitleCase(document.getElementById('office-desk-id')?.value.trim() || '');
      const qty = parseInt(document.getElementById('office-qty')?.value) || 1;

      item.officeName = offName;
      item.officeDeskId = deskId;
      item.qty = qty;
      item.icon = '🏢';
      item.title = `Placa Oficina: ${offName || 'Personal'}`;
      item.subtitle = deskId ? `Cubículo: ${deskId}` : 'Placa de escritorio';
    }

    return item;
  }

  validateItem(item, silent = false) {
    if (item.category === 'station') {
      if (!item.nameEn) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el nombre en inglés (Process Name) de la estación.');
          document.getElementById('station-name-en')?.focus();
        }
        return false;
      }
      if (!item.nameEs) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el nombre en español (Nombre de Proceso) de la estación.');
          document.getElementById('station-name-es')?.focus();
        }
        return false;
      }
    } else if (item.category === 'bin') {
      if (!item.partNumber) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el Número de Parte (P/N) del Bin.');
          document.getElementById('bin-part-number')?.focus();
        }
        return false;
      }
      if (item.binType === 'simple' && !item.commonName) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el Nombre Común / Descripción del material.');
          document.getElementById('bin-common-name')?.focus();
        }
        return false;
      }
    } else if (item.category === 'slot') {
      if (!item.slotNumber) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el Número de Slot.');
          document.getElementById('slot-number')?.focus();
        }
        return false;
      }
    } else if (item.category === 'aerial') {
      if (!item.aerialNameEn) {
        if (!silent) {
          this.showToast('⚠️ Ingresa el nombre en inglés del letrero aéreo.');
          document.getElementById('aerial-name-en')?.focus();
        }
        return false;
      }
    } else if (item.category === 'laptop') {
      if (!item.laptopName) {
        if (!silent) {
          this.showToast('⚠️ Ingresa tu nombre y apellido para el vinil de laptop.');
          document.getElementById('laptop-name')?.focus();
        }
        return false;
      }
    } else if (item.category === 'office') {
      if (!item.officeName) {
        if (!silent) {
          this.showToast('⚠️ Ingresa tu nombre y apellido para el vinil de oficina.');
          document.getElementById('office-name')?.focus();
        }
        return false;
      }
    }
    return true;
  }

  addItemToCart() {
    const item = this.captureCurrentItem();
    if (!this.validateItem(item, false)) return;

    item.id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.cartItems.push(item);

    this.renderCart();
    this.showToast(`✅ "${item.title}" agregada al pedido (${this.cartItems.length} identificaciones en total).`);

    // Limpiar campos específicos para que agreguen otra fácilmente
    this.resetCurrentCategoryInputs();
    this.refreshLivePreview();
  }

  removeItemFromCart(itemId) {
    const idx = this.cartItems.findIndex(it => it.id === itemId);
    if (idx !== -1) {
      const removed = this.cartItems.splice(idx, 1)[0];
      this.renderCart();
      this.showToast(`🗑️ "${removed.title}" removida del pedido.`);
    }
  }

  renderCart() {
    const cartSection = document.getElementById('order-cart-section');
    const listEl = document.getElementById('cart-items-list');
    const summaryText = document.getElementById('cart-summary-text');
    const totalBadge = document.getElementById('cart-total-badge');
    const submitBtnText = document.getElementById('btn-submit-order-text');

    if (!cartSection || !listEl) return;

    if (this.cartItems.length === 0) {
      cartSection.style.display = 'none';
      if (submitBtnText) submitBtnText.textContent = 'Enviar Pedido';
      return;
    }

    cartSection.style.display = 'block';
    const totalPzas = this.cartItems.reduce((acc, it) => acc + (it.qty || 1), 0);

    if (summaryText) summaryText.textContent = `${this.cartItems.length} tipo(s) de identificación agregada(s)`;
    if (totalBadge) totalBadge.textContent = `Total: ${totalPzas} pzas`;
    if (submitBtnText) submitBtnText.textContent = `Enviar Pedido (${this.cartItems.length} tipos • ${totalPzas} pzas)`;

    listEl.innerHTML = this.cartItems.map((item, idx) => `
      <div class="cart-item-row">
        <div class="cart-item-left">
          <div class="cart-item-icon">${item.icon || '🏷️'}</div>
          <div>
            <div class="cart-item-title">${idx + 1}. ${item.title}</div>
            <div class="cart-item-subtitle">${item.subtitle}</div>
          </div>
        </div>
        <div class="cart-item-right">
          <span class="cart-item-qty">${item.qty} pzas</span>
          <button type="button" class="btn-remove-cart-item" onclick="app.removeItemFromCart('${item.id}')" title="Eliminar del pedido">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  resetCurrentCategoryInputs() {
    const safeClear = (id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    };

    if (this.currentCategory === 'station') {
      safeClear('station-name-en');
      safeClear('station-name-es');
      safeClear('flow-prev-process');
      safeClear('flow-next-process');
    } else if (this.currentCategory === 'bin') {
      safeClear('bin-part-number');
      safeClear('bin-common-name');
      this.clearBinPhoto();
    } else if (this.currentCategory === 'scrap') {
      safeClear('scrap-line');
    } else if (this.currentCategory === 'slot') {
      safeClear('slot-number');
    } else if (this.currentCategory === 'aerial') {
      safeClear('aerial-name-en');
      safeClear('aerial-name-es');
    } else if (this.currentCategory === 'laptop') {
      safeClear('laptop-name');
    } else if (this.currentCategory === 'office') {
      safeClear('office-name');
      safeClear('office-desk-id');
    }
  }

  /* ========================================================================
     ORDER CREATION & SUBMISSION
     ======================================================================== */
  handleOrderSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    // 1. Validar Datos del Solicitante
    const reqName = document.getElementById('requester-name')?.value.trim();
    const reqEmail = document.getElementById('requester-email')?.value.trim();
    const reqLineArea = document.getElementById('order-line-area')?.value.trim();

    if (!reqName || !reqEmail || !reqLineArea) {
      this.showToast('⚠️ Por favor completa los Datos para Entrega (Nombre, Correo y Línea).');
      if (!reqName) document.getElementById('requester-name')?.focus();
      else if (!reqEmail) document.getElementById('requester-email')?.focus();
      else if (!reqLineArea) document.getElementById('order-line-area')?.focus();
      return;
    }

    // 2. Determinar los items a ordenar
    let itemsToOrder = [...this.cartItems];

    if (itemsToOrder.length === 0) {
      // Si el carrito está vacío, capturar el item actual del formulario
      const currentItem = this.captureCurrentItem();
      if (!this.validateItem(currentItem, false)) {
        return;
      }
      currentItem.id = 'item_' + Date.now();
      itemsToOrder.push(currentItem);
    } else {
      // Si ya hay items en el carrito y además llenó algo válido en el formulario, incluirlo
      const currentItem = this.captureCurrentItem();
      if (this.validateItem(currentItem, true)) {
        currentItem.id = 'item_' + Date.now();
        itemsToOrder.push(currentItem);
      }
    }

    const orderId = 'FLX-' + (1000 + this.orders.length + 1);
    const requester = {
      name: this.toTitleCase(reqName),
      email: reqEmail,
      priority: document.getElementById('order-priority')?.value || 'Normal',
      notes: document.getElementById('order-notes')?.value.trim() || ''
    };
    const lineArea = this.toTitleCase(reqLineArea);
    const totalQty = itemsToOrder.reduce((acc, it) => acc + (it.qty || 1), 0);
    const isMulti = itemsToOrder.length > 1;

    let newOrder = {
      id: orderId,
      items: itemsToOrder,
      totalQty: totalQty,
      category: isMulti ? 'multi' : itemsToOrder[0].category,
      requester: requester,
      lineArea: lineArea,
      status: 'pending',
      createdAt: new Date().toISOString(),
      // Propiedades de primer nivel para retrocompatibilidad
      ...itemsToOrder[0],
      id: orderId,
      category: isMulti ? 'multi' : itemsToOrder[0].category,
      processes: isMulti ? [
        { name: `Impresión de ${itemsToOrder.length} tipo(s) de señales (${totalQty} pzas)`, completed: false },
        { name: 'Enmicado térmico / acabado rígido', completed: false },
        { name: 'Corte de precisión y empaque por lote', completed: false }
      ] : (itemsToOrder[0].processes || [
        { name: 'Impresión', completed: false },
        { name: 'Enmicado térmico', completed: false },
        { name: 'Corte a medida', completed: false }
      ])
    };

    this.orders.unshift(newOrder);
    this.saveOrders();

    this.currentSuccessOrder = newOrder;

    // Limpiar carrito y campos
    this.cartItems = [];
    this.renderCart();

    const safeReset = (id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    };

    safeReset('station-name-en');
    safeReset('station-name-es');
    safeReset('flow-prev-process');
    safeReset('flow-next-process');
    safeReset('bin-part-number');
    safeReset('bin-common-name');
    safeReset('scrap-line');
    safeReset('slot-number');
    safeReset('slot-rack-name');
    safeReset('aerial-name-en');
    safeReset('aerial-name-es');
    safeReset('laptop-name');
    safeReset('office-name');
    safeReset('office-desk-id');
    safeReset('order-notes');
    this.clearBinPhoto();

    // Show Folio Modal prominently
    const ticketIdEl = document.getElementById('success-ticket-id');
    if (ticketIdEl) ticketIdEl.textContent = newOrder.id;

    const copyTxt = document.getElementById('copy-folio-text');
    if (copyTxt) copyTxt.textContent = 'Copiar Folio';

    const copyIcon = document.getElementById('copy-folio-icon');
    if (copyIcon) copyIcon.textContent = '📋';

    const supportsPptx = itemsToOrder.some(it => ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(it.category));
    const pptxBtn = document.getElementById('btn-success-pptx');
    if (pptxBtn) pptxBtn.style.display = supportsPptx ? 'inline-flex' : 'none';

    this.openModal('modal-order-success');
    this.showToast(`✅ Pedido ${newOrder.id} registrado con éxito (${itemsToOrder.length} tipo(s) • ${totalQty} pzas).`);
    this.refreshLivePreview();
  }

  copyFolioToClipboard() {
    if (!this.currentSuccessOrder) return;
    const folio = this.currentSuccessOrder.id;
    navigator.clipboard.writeText(folio).then(() => {
      document.getElementById('copy-folio-text').textContent = '¡Copiado!';
      document.getElementById('copy-folio-icon').textContent = '✅';
      this.showToast(`📋 Folio ${folio} copiado al portapapeles.`);
    }).catch(() => {
      prompt('Copia tu folio:', folio);
    });
  }

  performTrackingSearchForSuccess() {
    if (this.currentSuccessOrder) {
      document.getElementById('track-search-input').value = this.currentSuccessOrder.id;
      this.performTrackingSearch();
    }
  }

  downloadSuccessPptx() {
    if (this.currentSuccessOrder) {
      this.generatePptxByOrder(this.currentSuccessOrder);
    }
  }

  /* ========================================================================
     KANBAN BOARD
     ======================================================================== */
  filterKanban(category) {
    this.activeFilter = category;
    document.querySelectorAll('.toolbar-filters .btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`filter-${category}`);
    if (btn) btn.classList.add('active');
    this.renderKanban();
  }

  searchKanban(query) {
    this.searchTerm = query.toLowerCase().trim();
    this.renderKanban();
  }

  renderKanban() {
    const cols = {
      pending: document.getElementById('cards-pending'),
      process: document.getElementById('cards-process'),
      ready: document.getElementById('cards-ready'),
      delivered: document.getElementById('cards-delivered')
    };

    if (!cols.pending) return;

    Object.values(cols).forEach(el => el.innerHTML = '');
    const counts = { pending: 0, process: 0, ready: 0, delivered: 0 };

    const filtered = this.orders.filter(order => {
      if (this.activeFilter !== 'all') {
        const matchesCategory = order.category === this.activeFilter ||
          (order.items && order.items.some(it => it.category === this.activeFilter));
        if (!matchesCategory) return false;
      }
      if (this.searchTerm) {
        let itemsText = '';
        if (order.items && order.items.length) {
          itemsText = order.items.map(it => `${it.title} ${it.subtitle} ${it.partNumber || ''} ${it.nameEn || ''}`).join(' ');
        }
        const text = `${order.id} ${order.nameEn || ''} ${order.nameEs || ''} ${order.partNumber || ''} ${order.commonName || ''} ${order.aerialName || ''} ${order.laptopName || ''} ${order.officeName || ''} ${order.requester?.name || ''} ${order.lineArea || ''} ${itemsText}`.toLowerCase();
        return text.includes(this.searchTerm);
      }
      return true;
    });

    filtered.forEach(order => {
      counts[order.status] = (counts[order.status] || 0) + 1;
      const card = this.createKanbanCardElement(order);
      if (cols[order.status]) {
        cols[order.status].appendChild(card);
      }
    });

    document.getElementById('col-count-pending').textContent = counts.pending;
    document.getElementById('col-count-process').textContent = counts.process;
    document.getElementById('col-count-ready').textContent = counts.ready;
    document.getElementById('col-count-delivered').textContent = counts.delivered;

    document.getElementById('kanban-badge-count').textContent = counts.pending + counts.process;
  }

  createKanbanCardElement(order) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.id = `card-${order.id}`;

    card.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', order.id);
      card.classList.add('is-dragging');
    };
    card.ondragend = () => {
      card.classList.remove('is-dragging');
    };

    const isMulti = order.items && order.items.length > 1;
    const catMeta = isMulti ? { icon: '📋', label: `Lote (${order.items.length})` } : ({
      station: { icon: '🏭', label: 'Estación' },
      bin: { icon: '📦', label: 'Bin' },
      scrap: { icon: '🗑️', label: 'Scrap' },
      slot: { icon: '🔢', label: 'Slot' },
      traveler: { icon: '🛒', label: 'Carro/Rack' },
      aerial: { icon: '🪧', label: 'Aéreo' },
      laptop: { icon: '💻', label: 'Laptop' },
      office: { icon: '🏢', label: 'Oficina' }
    }[order.category] || { icon: '🏷️', label: 'Señal' });

    let mainTitle = '';
    let subTitle = '';
    if (isMulti) {
      mainTitle = `Lote de ${order.items.length} identificaciones (${order.totalQty || order.qty} pzas)`;
      subTitle = order.items.map(it => `${it.title} (${it.qty} pz)`).join(' • ');
    } else {
      mainTitle = order.nameEn || order.partNumber || order.aerialName || order.laptopName || order.officeName || order.slotNumber || (order.items && order.items[0]?.title) || 'Señalética';
      subTitle = order.nameEs || order.commonName || (order.items && order.items[0]?.subtitle) || order.lineArea || '';
    }

    const totalSteps = order.processes?.length || 1;
    const completedSteps = order.processes?.filter(p => p.completed).length || 0;
    const pct = Math.round((completedSteps / totalSteps) * 100);

    let processesHtml = '';
    if (order.processes && order.processes.length > 0) {
      processesHtml = `
        <div class="card-processes-section">
          <div class="processes-header">
            <span class="processes-title">Subprocesos</span>
            <span class="processes-progress-pct">${pct}%</span>
          </div>
          <div style="background:#e2e8f0; height:3px; border-radius:2px; margin-bottom:6px; overflow:hidden;">
            <div style="background:#009add; height:100%; width:${pct}%;"></div>
          </div>
          <div class="processes-list">
            ${order.processes.map((proc, idx) => `
              <label class="process-step-item ${proc.completed ? 'completed' : ''}" onclick="event.stopPropagation()">
                <input type="checkbox" ${proc.completed ? 'checked' : ''} onchange="app.toggleSubprocess('${order.id}', ${idx}, this.checked)">
                <span>${idx + 1}. ${proc.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    const itemsSummaryPills = isMulti ? `
      <div style="display:flex; flex-wrap:wrap; gap:4px; margin:6px 0 8px 0;">
        ${order.items.map(it => `
          <span style="font-size:0.72rem; background:#f1f5f9; color:#334155; padding:2px 7px; border-radius:4px; border:1px solid #e2e8f0; white-space:nowrap;">
            ${it.icon || '🏷️'} ${it.title} <strong>(${it.qty} pz)</strong>
          </span>
        `).join('')}
      </div>
    ` : '';

    const supportsPptx = (order.items && order.items.some(it => ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(it.category))) ||
      ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(order.category);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="ticket-tag">${order.id}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">${catMeta.icon} ${catMeta.label}</span>
          <span class="priority-tag ${order.requester?.priority === 'Urgente' ? 'priority-urgent' : 'priority-normal'}">
            ${order.requester?.priority || 'Normal'}
          </span>
        </div>
      </div>

      <div class="card-main-title">${mainTitle}</div>
      <div class="card-subtitle">${subTitle}</div>
      ${itemsSummaryPills}

      ${processesHtml}

      <div class="card-footer-info">
        <span>👤 ${order.requester?.name || 'Solicitante'}</span>
        <span>📍 ${order.lineArea || 'Planta'}</span>
      </div>

      <div class="card-actions-row">
        ${supportsPptx ? `
          <button class="btn btn-secondary btn-sm" onclick="app.generatePptxByOrderId('${order.id}')" title="Descargar formato PowerPoint para imprimir">
            📥 PPTX
          </button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="app.showOrderDetail('${order.id}')">
          👁️ Detalle
        </button>
        
        ${order.status === 'pending' ? `
          <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="app.changeOrderStatus('${order.id}', 'process')">Iniciar ⚙️</button>
        ` : ''}
        ${order.status === 'process' ? `
          <button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="app.changeOrderStatus('${order.id}', 'ready')">Listo 📦</button>
        ` : ''}
        ${order.status === 'ready' ? `
          <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="app.changeOrderStatus('${order.id}', 'delivered')">Entregar ✅</button>
        ` : ''}
        ${order.status === 'delivered' ? `
          <span style="margin-left:auto; font-size:0.75rem; font-weight:700; color:#10b981;">✓ Entregado</span>
        ` : ''}
      </div>
    `;

    return card;
  }

  toggleSubprocess(orderId, stepIndex, isCompleted) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || !order.processes || !order.processes[stepIndex]) return;

    order.processes[stepIndex].completed = isCompleted;

    if (order.status === 'pending' && isCompleted) {
      order.status = 'process';
      this.showToast(`⚙️ Pedido ${order.id} movido a "En Proceso".`);
    }

    const allDone = order.processes.every(p => p.completed);
    if (allDone && order.status === 'process') {
      order.status = 'ready';
      this.showToast(`📦 ¡Procesos terminados! ${order.id} listo para entrega.`);
    }

    this.saveOrders();
  }

  changeOrderStatus(orderId, newStatus) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    order.status = newStatus;
    if (newStatus === 'delivered' && order.processes) {
      order.processes.forEach(p => p.completed = true);
    }

    this.saveOrders();
    this.showToast(`Estatus de ${order.id} cambiado a "${this.getStatusLabel(newStatus)}".`);
  }

  handleDragOver(e) { e.preventDefault(); }
  handleDrop(e, targetStatus) {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('text/plain');
    if (orderId) this.changeOrderStatus(orderId, targetStatus);
  }

  getStatusLabel(status) {
    switch (status) {
      case 'pending': return 'Por Iniciar';
      case 'process': return 'En Proceso';
      case 'ready': return 'Listo para Entrega';
      case 'delivered': return 'Entregado';
      default: return status;
    }
  }

  /* ========================================================================
     TRACKING PORTAL
     ======================================================================== */
  performTrackingSearch() {
    const query = document.getElementById('track-search-input').value.toLowerCase().trim();
    const resultArea = document.getElementById('tracking-result-area');

    if (!query) {
      resultArea.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted);">Ingresa un número de folio o nombre.</div>`;
      return;
    }

    const match = this.orders.find(o => 
      o.id.toLowerCase() === query || 
      o.id.toLowerCase() === `#${query}` ||
      o.requester?.name?.toLowerCase().includes(query) ||
      o.nameEn?.toLowerCase().includes(query) ||
      o.partNumber?.toLowerCase().includes(query) ||
      (o.items && o.items.some(it => 
        it.title?.toLowerCase().includes(query) ||
        it.partNumber?.toLowerCase().includes(query) ||
        it.nameEn?.toLowerCase().includes(query)
      ))
    );

    if (!match) {
      resultArea.innerHTML = `
        <div class="tracking-result-card" style="text-align:center; padding:30px;">
          <div style="font-size:2rem; margin-bottom:8px;">🔎</div>
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--navy-dark); margin-bottom:4px;">No se encontró ningún pedido con "${query}"</h3>
          <p style="color:var(--text-muted); font-size:0.85rem;">Verifica el número de folio (ej. #FLX-1001).</p>
        </div>
      `;
      return;
    }

    this.renderTrackingCard(match, resultArea);
  }

  renderTrackingCard(order, container) {
    let step = 1;
    if (order.status === 'process') step = 2;
    if (order.status === 'ready') step = 3;
    if (order.status === 'delivered') step = 4;

    const progressPercent = ((step - 1) / 3) * 100;
    const isMulti = order.items && order.items.length > 1;
    let mainTitle = isMulti
      ? `Lote de ${order.items.length} identificaciones (${order.totalQty || order.qty} pzas)`
      : (order.nameEn || order.partNumber || order.aerialName || order.laptopName || order.officeName || order.slotNumber || (order.items && order.items[0]?.title) || 'Señal');

    let itemsBreakdownHtml = '';
    if (order.items && order.items.length > 0) {
      itemsBreakdownHtml = `
        <div style="margin-top:16px; background:#ffffff; border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px;">
          <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:10px;">
            Contenido del Pedido (${order.items.length} tipo(s) • ${order.totalQty || order.qty} pzas en total):
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${order.items.map((it, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--bg-subtle); border-radius:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:1.1rem;">${it.icon || '🏷️'}</span>
                  <div>
                    <div style="font-weight:700; font-size:0.86rem; color:var(--navy-dark);">${idx + 1}. ${it.title}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${it.subtitle}</div>
                  </div>
                </div>
                <span class="badge-counter" style="font-size:0.8rem; padding:3px 8px;">${it.qty} pzas</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="tracking-result-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span class="ticket-tag" style="font-size:1.1rem; padding:4px 8px;">${order.id}</span>
              <span style="font-size:0.85rem; font-weight:700; color:var(--flex-blue); text-transform:uppercase;">
                ${isMulti ? `Lote (${order.items.length} tipos)` : order.category}
              </span>
            </div>
            <h3 style="font-size:1.25rem; font-weight:800; color:var(--navy-dark);">${mainTitle}</h3>
            <p style="color:var(--text-muted); font-size:0.85rem;">${order.lineArea}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-muted);">Estatus</div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--flex-blue);">${this.getStatusLabel(order.status)}</div>
          </div>
        </div>

        <div class="timeline-tracker">
          <div class="timeline-progress-bar" style="width: ${progressPercent}%;"></div>
          <div class="timeline-node ${step >= 1 ? (step === 1 ? 'active' : 'completed') : ''}">
            <div class="timeline-circle">1</div>
            <div class="timeline-label">Solicitado</div>
          </div>
          <div class="timeline-node ${step >= 2 ? (step === 2 ? 'active' : 'completed') : ''}">
            <div class="timeline-circle">2</div>
            <div class="timeline-label">En Proceso</div>
          </div>
          <div class="timeline-node ${step >= 3 ? (step === 3 ? 'active' : 'completed') : ''}">
            <div class="timeline-circle">3</div>
            <div class="timeline-label">Listo</div>
          </div>
          <div class="timeline-node ${step >= 4 ? 'completed' : ''}">
            <div class="timeline-circle">4</div>
            <div class="timeline-label">Entregado</div>
          </div>
        </div>

        ${itemsBreakdownHtml}

        ${order.processes && order.processes.length > 0 ? `
          <div style="margin-top:16px; background:var(--bg-subtle); padding:12px 16px; border-radius:var(--radius-sm);">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px;">Progreso de Fabricación:</div>
            <div style="display:flex; gap:14px; flex-wrap:wrap;">
              ${order.processes.map((p, idx) => `
                <div style="font-size:0.82rem; font-weight:600; color:${p.completed ? '#10b981' : 'var(--navy-dark)'};">
                  ${p.completed ? '✅' : '⏳'} ${idx + 1}. ${p.name}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; margin-top:14px; font-size:0.8rem; color:var(--text-muted);">
          <div>Solicitante: <strong>${order.requester?.name}</strong></div>
          <div>Entrega en: <strong>${order.lineArea}</strong></div>
        </div>
      </div>
    `;
  }

  renderTrackingRecent() {
    const list = document.getElementById('tracking-recent-list');
    if (!list) return;

    if (this.orders.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted);">No hay pedidos registrados.</div>`;
      return;
    }

    list.innerHTML = this.orders.slice(0, 6).map(order => {
      const isMulti = order.items && order.items.length > 1;
      let title = isMulti
        ? `Lote (${order.items.length} tipos • ${order.totalQty || order.qty} pzas)`
        : (order.nameEn || order.partNumber || order.aerialName || order.laptopName || order.officeName || order.slotNumber || (order.items && order.items[0]?.title) || 'Señal');

      return `
        <div class="kanban-card" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:10px 14px;" onclick="app.quickTrack('${order.id}')">
          <div style="display:flex; align-items:center; gap:12px;">
            <span class="ticket-tag">${order.id}</span>
            <div>
              <div style="font-weight:700; color:var(--navy-dark); font-size:0.9rem;">${title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${order.requester?.name || 'Solicitante'} • ${order.lineArea || ''}</div>
            </div>
          </div>
          <span class="priority-tag" style="background:${order.status === 'delivered' ? '#d1fae5' : order.status === 'ready' ? '#dbeafe' : '#fef3c7'}; color:${order.status === 'delivered' ? '#065f46' : order.status === 'ready' ? '#1e40af' : '#92400e'};">
            ${this.getStatusLabel(order.status)}
          </span>
        </div>
      `;
    }).join('');
  }

  quickTrack(orderId) {
    document.getElementById('track-search-input').value = orderId;
    this.performTrackingSearch();
    window.scrollTo({ top: 100, behavior: 'smooth' });
  }

  /* ========================================================================
     POWERPOINT (.pptx) GENERATOR - 100% AUTOMATIC & FIXED
     Letter Landscape (11 x 8.5 in) with exact straight-corner layout
     ======================================================================== */
  generatePptxByOrderId(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) this.generatePptxByOrder(order);
  }

  downloadCurrentPptxPreview() {
    const category = this.currentCategory;
    let mockOrder = {
      id: 'PREVIEW',
      category: category,
      copies: 4
    };

    if (category === 'station') {
      const subType = document.getElementById('station-sub-type')?.value || 'flow';
      mockOrder.stationType = subType;
      mockOrder.stationSize = (subType === 'automatic') ? '13.5x24.5' : '9x12.5';
      mockOrder.nameEn = document.getElementById('station-name-en')?.value.trim() || 'Process Name';
      mockOrder.nameEs = document.getElementById('station-name-es')?.value.trim() || 'Nombre de Proceso';
      mockOrder.prevProcess = document.getElementById('flow-prev-process')?.value.trim() || 'Previous Process';
      mockOrder.nextProcess = document.getElementById('flow-next-process')?.value.trim() || 'Next Process';
      mockOrder.flowDirection = this.flowDirection;
      mockOrder.isCritical = document.getElementById('check-is-critical')?.checked || false;
      mockOrder.isSeated = document.getElementById('check-is-seated')?.checked || false;
      mockOrder.copies = parseInt(document.getElementById('station-copies')?.value) || 4;
    } else if (category === 'bin') {
      mockOrder.binType = document.getElementById('bin-sub-type')?.value || 'simple';
      mockOrder.binSize = document.getElementById('bin-size')?.value || '4x10';
      mockOrder.partNumber = (document.getElementById('bin-part-number')?.value.trim() || 'TYEH-1144337_00-BW').toUpperCase();
      mockOrder.commonName = document.getElementById('bin-common-name')?.value.trim() || 'Tornillo M4 x 12mm';
      mockOrder.minVal = document.getElementById('bin-min')?.value.trim() || '20';
      mockOrder.maxVal = document.getElementById('bin-max')?.value.trim() || '150';
      mockOrder.rpVal = document.getElementById('bin-rp')?.value.trim() || '50';
      mockOrder.photoDataUrl = this.binPhotoDataUrl;
      mockOrder.qty = parseInt(document.getElementById('bin-qty')?.value) || 8;
    } else if (category === 'scrap') {
      mockOrder.scrapSize = document.getElementById('scrap-size')?.value || '9x12.5';
      mockOrder.scrapLine = document.getElementById('scrap-line')?.value.trim() || 'Línea de Planta';
      mockOrder.qty = parseInt(document.getElementById('scrap-qty')?.value) || 4;
    } else if (category === 'slot') {
      mockOrder.slotNumber = document.getElementById('slot-number')?.value.trim() || '1';
      mockOrder.rackName = document.getElementById('slot-rack-name')?.value.trim() || 'RACK IST';
      mockOrder.qty = parseInt(document.getElementById('slot-qty')?.value) || 3;
    } else if (category === 'traveler') {
      mockOrder.travelerType = document.getElementById('traveler-type')?.value || 'Carro';
      mockOrder.travelerSize = '9x12.5';
      mockOrder.isReusableTemplate = true;
      mockOrder.qty = parseInt(document.getElementById('traveler-qty')?.value) || 4;
    } else if (category === 'aerial') {
      mockOrder.aerialNameEn = document.getElementById('aerial-name-en')?.value.trim() || 'PCR Lines';
      mockOrder.aerialNameEs = document.getElementById('aerial-name-es')?.value.trim() || 'Lineas de PCR';
      mockOrder.qty = parseInt(document.getElementById('aerial-qty')?.value) || 1;
    }

    this.generatePptxByOrder(mockOrder);
  }

  generatePptxByOrder(order) {
    const PptxClass = window.PptxGenJS || (typeof PptxGenJS !== 'undefined' ? PptxGenJS : null) || (typeof pptxgen !== 'undefined' ? pptxgen : null);
    if (!PptxClass) {
      alert('Error: Librería PowerPoint no cargada.');
      return;
    }

    try {
      const pptx = new PptxClass();
      pptx.defineLayout({ name: 'LETTER_LANDSCAPE', width: 11.0, height: 8.5 });
      pptx.layout = 'LETTER_LANDSCAPE';

      const assets = window.FLEX_ASSETS || {};

      const items = (order.items && order.items.length > 0) ? order.items : [order];
      let generatedCount = 0;

      for (const item of items) {
        if (item.category === 'station') {
          this.buildPptxStationSlides(pptx, item, assets);
          generatedCount++;
        } else if (item.category === 'bin') {
          this.buildPptxBinSlides(pptx, item, assets);
          generatedCount++;
        } else if (item.category === 'scrap') {
          this.buildPptxScrapSlides(pptx, item, assets);
          generatedCount++;
        } else if (item.category === 'slot') {
          this.buildPptxSlotSlides(pptx, item, assets);
          generatedCount++;
        } else if (item.category === 'traveler') {
          this.buildPptxTravelerSlides(pptx, item, assets);
          generatedCount++;
        } else if (item.category === 'aerial') {
          this.buildPptxAerialSlides(pptx, item, assets);
          generatedCount++;
        }
      }

      if (generatedCount === 0) {
        alert('Este pedido no contiene señaléticas que requieran formato PowerPoint (ej. vinil de corte o laptop).');
        return;
      }

      let filename = '';
      if (order.items && order.items.length > 1) {
        filename = `Lote_Senaletica_${order.id || 'Pedido'}_${order.items.length}_items.pptx`;
      } else {
        const singleItem = items[0];
        const safeName = (singleItem.nameEn || singleItem.partNumber || singleItem.aerialNameEn || singleItem.travelerType || singleItem.category || 'Formato').replace(/[^a-zA-Z0-9]/g, '_');
        filename = `Identificacion_${safeName}_${order.id || 'Nuevo'}.pptx`;
      }

      pptx.writeFile({ fileName: filename })
        .then(() => {
          this.showToast(`📥 Descargando archivo PowerPoint: ${filename}`);
        })
        .catch(err => {
          console.error('Error al guardar PowerPoint:', err);
          alert('Hubo un error al generar el archivo PowerPoint: ' + err.message);
        });

    } catch (err) {
      console.error('Error PPTX:', err);
      alert('Error al generar PowerPoint: ' + err.message);
    }
  }

  /* 1. Estación de Planta: 9x12.5 cm (4 por hoja) o 13.5x24.5 cm Línea Automática (1 por hoja) */
  buildPptxStationSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const isAuto = (order.stationType === 'automatic' || order.stationSize === '13.5x24.5');

    if (isAuto) {
      // Formato B29 Estación Línea Automática: 13.5 x 24.5 cm (Slide 24)
      const copiesNeeded = order.copies || 1;
      for (let s = 0; s < copiesNeeded; s++) {
        const slide = pptx.addSlide();
        const p = { x: 0.67, y: 1.59, w: 9.65, h: 5.31 };

        slide.addShape(shapeRect, {
          x: p.x, y: p.y, w: p.w, h: p.h,
          line: { color: '009ADD', width: 4.0 },
          fill: { color: 'FFFFFF' }
        });

        if (assets.rohsBadge) {
          slide.addImage({
            data: assets.rohsBadge,
            x: p.x + 8.40, y: p.y + 0.20, w: 1.00, h: 1.05
          });
        }

        if (order.isSeated && assets.seatedOperator) {
          slide.addImage({
            data: assets.seatedOperator,
            x: p.x + 3.20, y: p.y + 0.20, w: 0.52, h: 1.05
          });
        }

        if (order.isCritical) {
          if (assets.criticalWarningBase64) {
            slide.addImage({
              data: assets.criticalWarningBase64,
              x: p.x + 4.90, y: p.y + 0.35, w: 0.85, h: 0.75
            });
          }
          slide.addText('Critical\nStation', {
            x: p.x + 5.85, y: p.y + 0.28, w: 1.90, h: 0.85,
            fontFace: 'Century Gothic', fontSize: 16, bold: true, color: '000000', lineSpacing: 18
          });
        }

        const titleEn = this.toTitleCase(order.nameEn || 'Process Name');
        const titleEs = this.toTitleCase(order.nameEs || 'Nombre de Proceso');

        slide.addText(titleEn, {
          x: p.x + 0.30, y: p.y + 1.45, w: p.w - 0.60, h: 0.90,
          fontFace: 'Century Gothic', fontSize: 36, bold: true, color: '000000', align: 'center', valign: 'middle'
        });

        slide.addText(titleEs, {
          x: p.x + 0.30, y: p.y + 2.40, w: p.w - 0.60, h: 0.75,
          fontFace: 'Century Gothic', fontSize: 24, color: '333333', align: 'center', valign: 'middle'
        });

        const isReverse = (order.flowDirection === 'rl');
        const leftLabel = isReverse ? this.toTitleCase(order.nextProcess || 'Next Process') : this.toTitleCase(order.prevProcess || 'Previous Process');
        const rightLabel = isReverse ? this.toTitleCase(order.prevProcess || 'Previous Process') : this.toTitleCase(order.nextProcess || 'Next Process');

        slide.addText(leftLabel, {
          x: p.x + 0.40, y: p.y + 3.75, w: 3.60, h: 0.70,
          fontFace: 'Century Gothic', fontSize: 18, bold: true, color: '000000', align: 'center', valign: 'middle'
        });

        if (assets.flowArrow) {
          slide.addImage({
            data: assets.flowArrow,
            x: p.x + 4.10, y: p.y + 3.65, w: 1.45, h: 0.90,
            rotate: isReverse ? 180 : 0
          });
        }

        slide.addText(rightLabel, {
          x: p.x + 5.65, y: p.y + 3.75, w: 3.60, h: 0.70,
          fontFace: 'Century Gothic', fontSize: 18, bold: true, color: '000000', align: 'center', valign: 'middle'
        });

        if (assets.flexLogo) {
          slide.addImage({
            data: assets.flexLogo,
            x: p.x + 7.85, y: p.y + 4.55, w: 1.50, h: 0.65
          });
        }
      }
      return;
    }

    // Formato Estándar 9 x 12.5 cm (Slides 8 y 10): 4 por hoja
    const cardPositions = [
      { x: 0.49, y: 0.12, w: 4.92, h: 3.54 },
      { x: 5.55, y: 0.12, w: 4.92, h: 3.54 },
      { x: 0.49, y: 3.75, w: 4.92, h: 3.54 },
      { x: 5.55, y: 3.75, w: 4.92, h: 3.54 }
    ];

    const copiesNeeded = order.copies || 4;
    const totalSlides = Math.ceil(copiesNeeded / 4);

    let placed = 0;
    for (let s = 0; s < totalSlides; s++) {
      const slide = pptx.addSlide();

      for (let pos = 0; pos < 4 && placed < copiesNeeded; pos++, placed++) {
        const p = cardPositions[pos];

        slide.addShape(shapeRect, {
          x: p.x, y: p.y, w: p.w, h: p.h,
          line: { color: '009ADD', width: 3.0 },
          fill: { color: 'FFFFFF' }
        });

        if (assets.rohsBadge) {
          slide.addImage({
            data: assets.rohsBadge,
            x: p.x + 4.15, y: p.y + 0.12, w: 0.62, h: 0.64
          });
        }

        if (order.isSeated && assets.seatedOperator) {
          slide.addImage({
            data: assets.seatedOperator,
            x: p.x + 1.65, y: p.y + 0.12, w: 0.31, h: 0.64
          });
        }

        if (order.isCritical) {
          if (assets.criticalWarningBase64) {
            slide.addImage({
              data: assets.criticalWarningBase64,
              x: p.x + 2.50, y: p.y + 0.22, w: 0.46, h: 0.41
            });
          }
          slide.addText('Critical\nStation', {
            x: p.x + 2.98, y: p.y + 0.18, w: 1.00, h: 0.47,
            fontFace: 'Century Gothic', fontSize: 9.5, bold: true, color: '000000', lineSpacing: 11
          });
        }

        const isFlow = (order.stationType !== 'standard');
        const titleTopY = isFlow ? (p.y + 0.95) : (p.y + 1.25);

        const titleEn = this.toTitleCase(order.nameEn || 'Process Name');
        const titleEs = this.toTitleCase(order.nameEs || 'Nombre de Proceso');

        slide.addText(titleEn, {
          x: p.x + 0.20, y: titleTopY, w: p.w - 0.40, h: 0.55,
          fontFace: 'Century Gothic', fontSize: 20, bold: true, color: '000000', align: 'center', valign: 'middle'
        });

        slide.addText(titleEs, {
          x: p.x + 0.20, y: titleTopY + 0.52, w: p.w - 0.40, h: 0.45,
          fontFace: 'Century Gothic', fontSize: 15, color: '333333', align: 'center', valign: 'middle'
        });

        if (isFlow) {
          const isReverse = (order.flowDirection === 'rl');
          const leftLabel = isReverse ? this.toTitleCase(order.nextProcess || 'Next Process') : this.toTitleCase(order.prevProcess || 'Previous Process');
          const rightLabel = isReverse ? this.toTitleCase(order.prevProcess || 'Previous Process') : this.toTitleCase(order.nextProcess || 'Next Process');

          slide.addText(leftLabel, {
            x: p.x + 0.10, y: p.y + 2.34, w: 1.90, h: 0.45,
            fontFace: 'Century Gothic', fontSize: 11, bold: true, color: '000000', align: 'center', valign: 'middle'
          });

          if (assets.flowArrow) {
            slide.addImage({
              data: assets.flowArrow,
              x: p.x + 2.05, y: p.y + 2.28, w: 0.82, h: 0.54,
              rotate: isReverse ? 180 : 0
            });
          }

          slide.addText(rightLabel, {
            x: p.x + 2.92, y: p.y + 2.34, w: 1.90, h: 0.45,
            fontFace: 'Century Gothic', fontSize: 11, bold: true, color: '000000', align: 'center', valign: 'middle'
          });
        }

        if (assets.flexLogo) {
          slide.addImage({
            data: assets.flexLogo,
            x: p.x + 4.00, y: p.y + 2.98, w: 0.78, h: 0.40
          });
        }
      }
    }
  }

  /* 2. Bines de Material (Slides 14 a 17): 4 Tamaños oficiales (2x7, 2.5x9, 4x10, 6x20 cm) */
  buildPptxBinSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const size = order.binSize || '4x10';
    const sizeConfig = {
      '2x7': { w: 2.76, h: 0.79, cols: 3, rows: 8, marginX: 0.96, marginY: 0.56, gapX: 0.40, gapY: 0.15 },
      '2.5x9': { w: 3.54, h: 0.98, cols: 2, rows: 6, marginX: 1.56, marginY: 0.81, gapX: 0.80, gapY: 0.20 },
      '4x10': { w: 3.94, h: 1.57, cols: 2, rows: 4, marginX: 1.16, marginY: 0.73, gapX: 0.80, gapY: 0.25 },
      '6x20': { w: 7.87, h: 2.36, cols: 1, rows: 3, marginX: 1.56, marginY: 0.41, gapX: 0.00, gapY: 0.30 }
    };

    const cfg = sizeConfig[size] || sizeConfig['4x10'];
    const qty = order.qty || (cfg.cols * cfg.rows);
    const totalSlides = Math.ceil(qty / (cfg.cols * cfg.rows));

    const pn = (order.partNumber || 'TYEH-1144337_00-BW').toUpperCase();
    const barcodeData = this.generateBarcodeDataUrl(pn);
    const qrData = this.generateQrDataUrl(pn);

    let placed = 0;
    for (let s = 0; s < totalSlides; s++) {
      const slide = pptx.addSlide();

      for (let r = 0; r < cfg.rows && placed < qty; r++) {
        for (let c = 0; c < cfg.cols && placed < qty; c++, placed++) {
          const x = cfg.marginX + c * (cfg.w + cfg.gapX);
          const y = cfg.marginY + r * (cfg.h + cfg.gapY);
          const w = cfg.w;
          const h = cfg.h;

          // 1. Marco exterior
          slide.addShape(shapeRect, {
            x: x, y: y, w: w, h: h,
            line: { color: 'CBD5E1', width: 0.8 },
            fill: { color: 'FFFFFF' }
          });

          // 2. Columna izquierda: Foto del Material
          const photoW = w * 0.28;
          slide.addShape(shapeRect, {
            x: x, y: y, w: photoW, h: h,
            line: { color: 'E2E8F0', width: 0.5 },
            fill: { color: 'F8FAFC' }
          });

          if (order.photoDataUrl) {
            slide.addImage({
              data: order.photoDataUrl,
              x: x + 0.04, y: y + 0.04, w: photoW - 0.08, h: h - 0.08,
              sizing: { type: 'contain' }
            });
          } else {
            slide.addText('Foto', {
              x: x, y: y + h * 0.35, w: photoW, h: h * 0.30,
              fontFace: 'Century Gothic', fontSize: Math.max(6.5, h * 5.5), color: '94A3B8', align: 'center', valign: 'middle'
            });
          }

          // 3. Columna derecha: Códigos, P/N y Banner Inferior
          const mainX = x + photoW;
          const mainW = w - photoW;

          // Fila superior: Barcode + QR + RoHS
          const topH = h * 0.34;
          const barcodeW = mainW * 0.48;
          slide.addImage({
            data: barcodeData,
            x: mainX + 0.06, y: y + 0.03, w: barcodeW, h: topH - 0.04
          });

          const qrSize = Math.min(topH - 0.04, 0.45);
          slide.addImage({
            data: qrData,
            x: mainX + barcodeW + 0.10, y: y + 0.03, w: qrSize, h: qrSize
          });

          if (assets.rohsBadge) {
            const rohsSize = Math.min(topH - 0.02, 0.44);
            slide.addImage({
              data: assets.rohsBadge,
              x: mainX + mainW - rohsSize - 0.05, y: y + 0.03, w: rohsSize, h: rohsSize
            });
          }

          // Fila media: Part Number
          const pnY = y + topH;
          const pnH = h * 0.33;
          const pnFontSize = Math.max(8, Math.min(Math.round(h * 11), 16));
          slide.addText(pn, {
            x: mainX + 0.08, y: pnY, w: mainW - 0.12, h: pnH,
            fontFace: 'Century Gothic', fontSize: pnFontSize, bold: true, color: '000000', align: 'left', valign: 'middle'
          });

          // Fila inferior
          const botY = y + topH + pnH;
          const botH = h - (topH + pnH);

          if (order.binType === 'minmax') {
            // Formato Min-Max (Slides 16-17): 4 bloques coloreados
            const wLogo = mainW * 0.25;
            const wMin = mainW * 0.25;
            const wMax = mainW * 0.25;
            const wRp = mainW - (wLogo + wMin + wMax);

            // Bloque Flex Logo
            slide.addShape(shapeRect, {
              x: mainX, y: botY, w: wLogo, h: botH,
              fill: { color: '009ADD' }, line: { color: '009ADD', width: 0 }
            });
            slide.addText('flex', {
              x: mainX, y: botY, w: wLogo, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(7, botH * 14), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
            });

            // Bloque Min (Rojo)
            slide.addShape(shapeRect, {
              x: mainX + wLogo, y: botY, w: wMin, h: botH,
              fill: { color: 'DC2626' }, line: { color: 'DC2626', width: 0 }
            });
            slide.addText(`Min: ${order.minVal || '20'}`, {
              x: mainX + wLogo, y: botY, w: wMin, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(6.5, botH * 13), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
            });

            // Bloque Max (Verde)
            slide.addShape(shapeRect, {
              x: mainX + wLogo + wMin, y: botY, w: wMax, h: botH,
              fill: { color: '16A34A' }, line: { color: '16A34A', width: 0 }
            });
            slide.addText(`Max: ${order.maxVal || '150'}`, {
              x: mainX + wLogo + wMin, y: botY, w: wMax, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(6.5, botH * 13), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
            });

            // Bloque RP (Ámbar)
            slide.addShape(shapeRect, {
              x: mainX + wLogo + wMin + wMax, y: botY, w: wRp, h: botH,
              fill: { color: 'D97706' }, line: { color: 'D97706', width: 0 }
            });
            slide.addText(`RP: ${order.rpVal || '50'}`, {
              x: mainX + wLogo + wMin + wMax, y: botY, w: wRp, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(6.5, botH * 13), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
            });

          } else {
            // Formato Simple (Slides 14-15): Banner Azul con Nombre Común y Logo Flex
            slide.addShape(shapeRect, {
              x: mainX, y: botY, w: mainW, h: botH,
              fill: { color: '009ADD' }, line: { color: '009ADD', width: 0 }
            });

            const descText = this.toTitleCase(order.commonName || 'Material');
            slide.addText(descText, {
              x: mainX + 0.08, y: botY, w: mainW - 0.70, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(7, botH * 14), bold: true, color: 'FFFFFF', align: 'left', valign: 'middle'
            });

            slide.addText('flex', {
              x: mainX + mainW - 0.65, y: botY, w: 0.60, h: botH,
              fontFace: 'Century Gothic', fontSize: Math.max(7.5, botH * 16), bold: true, color: 'FFFFFF', align: 'right', valign: 'middle'
            });
          }
        }
      }
    }
  }

  /* 3. Tarjetas de Scrap (Slides 18-20): 5 Tamaños oficiales, Tarjeta Roja Oficial */
  buildPptxScrapSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const scrapSize = order.scrapSize || '9x12.5';

    if (scrapSize === '9x12.5') {
      // 9 x 12.5 cm: 4 tarjetas por hoja carta horizontal
      const cardPositions = [
        { x: 0.49, y: 0.45, w: 4.92, h: 3.54 },
        { x: 5.59, y: 0.45, w: 4.92, h: 3.54 },
        { x: 0.49, y: 4.30, w: 4.92, h: 3.54 },
        { x: 5.59, y: 4.30, w: 4.92, h: 3.54 }
      ];

      const qty = order.qty || 4;
      const totalSlides = Math.ceil(qty / 4);
      let placed = 0;

      for (let s = 0; s < totalSlides; s++) {
        const slide = pptx.addSlide();

        for (let pos = 0; pos < 4 && placed < qty; pos++, placed++) {
          const p = cardPositions[pos];

          // Fondo rojo oficial
          slide.addShape(shapeRect, {
            x: p.x, y: p.y, w: p.w, h: p.h,
            fill: { color: 'DC2626' },
            line: { color: 'B91C1C', width: 1.5 }
          });

          // RoHS en la esquina superior derecha
          if (assets.rohsBadge) {
            slide.addImage({
              data: assets.rohsBadge,
              x: p.x + p.w - 0.85, y: p.y + 0.20, w: 0.65, h: 0.68
            });
          }

          // Texto "Scrap" en blanco, grande y centrado
          slide.addText('Scrap', {
            x: p.x + 0.20, y: p.y + 1.05, w: p.w - 0.40, h: 1.30,
            fontFace: 'Century Gothic', fontSize: 62, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
          });

          // Logo Flex blanco abajo a la derecha
          slide.addText('flex', {
            x: p.x + p.w - 1.40, y: p.y + p.h - 0.70, w: 1.20, h: 0.50,
            fontFace: 'Century Gothic', fontSize: 26, bold: true, color: 'FFFFFF', align: 'right', valign: 'middle'
          });
        }
      }
      return;
    }

    // Otros 4 tamaños en rejilla: 2x7, 2.5x9, 4x10, 6x20 cm
    const sizeConfig = {
      '2x7': { w: 2.76, h: 0.79, cols: 3, rows: 8, marginX: 0.96, marginY: 0.56, gapX: 0.40, gapY: 0.15 },
      '2.5x9': { w: 3.54, h: 0.98, cols: 2, rows: 6, marginX: 1.56, marginY: 0.81, gapX: 0.80, gapY: 0.20 },
      '4x10': { w: 3.94, h: 1.57, cols: 2, rows: 4, marginX: 1.16, marginY: 0.73, gapX: 0.80, gapY: 0.25 },
      '6x20': { w: 7.87, h: 2.36, cols: 1, rows: 3, marginX: 1.56, marginY: 0.41, gapX: 0.00, gapY: 0.30 }
    };

    const cfg = sizeConfig[scrapSize] || sizeConfig['4x10'];
    const qty = order.qty || (cfg.cols * cfg.rows);
    const totalSlides = Math.ceil(qty / (cfg.cols * cfg.rows));
    let placed = 0;

    for (let s = 0; s < totalSlides; s++) {
      const slide = pptx.addSlide();

      for (let r = 0; r < cfg.rows && placed < qty; r++) {
        for (let c = 0; c < cfg.cols && placed < qty; c++, placed++) {
          const x = cfg.marginX + c * (cfg.w + cfg.gapX);
          const y = cfg.marginY + r * (cfg.h + cfg.gapY);

          slide.addShape(shapeRect, {
            x: x, y: y, w: cfg.w, h: cfg.h,
            fill: { color: 'DC2626' },
            line: { color: 'B91C1C', width: 1 }
          });

          if (assets.rohsBadge) {
            const rohsH = Math.min(cfg.h * 0.35, 0.45);
            slide.addImage({
              data: assets.rohsBadge,
              x: x + cfg.w - rohsH - 0.06, y: y + 0.04, w: rohsH, h: rohsH
            });
          }

          const scrapFontSize = Math.max(12, Math.min(Math.round(cfg.h * 24), 38));
          slide.addText('Scrap', {
            x: x + 0.10, y: y + (cfg.h - cfg.h * 0.5) / 2, w: cfg.w - 0.20, h: cfg.h * 0.50,
            fontFace: 'Century Gothic', fontSize: scrapFontSize, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
          });

          slide.addText('flex', {
            x: x + cfg.w - 0.70, y: y + cfg.h - 0.35, w: 0.65, h: 0.30,
            fontFace: 'Century Gothic', fontSize: Math.max(7, cfg.h * 8), bold: true, color: 'FFFFFF', align: 'right', valign: 'middle'
          });
        }
      }
    }
  }

  /* 4. Slot con esquinas rectas */
  buildPptxSlotSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const slide = pptx.addSlide();
    const positions = [
      { x: 0.6, y: 1.0, w: 3.0, h: 6.5 },
      { x: 4.0, y: 1.0, w: 3.0, h: 6.5 },
      { x: 7.4, y: 1.0, w: 3.0, h: 6.5 }
    ];

    for (let i = 0; i < 3; i++) {
      const p = positions[i];
      slide.addShape(shapeRect, {
        x: p.x, y: p.y, w: p.w, h: p.h,
        line: { color: '009ADD', width: 3 },
        fill: { color: 'FFFFFF' }
      });

      if (assets.rohsBadge) {
        slide.addImage({
          data: assets.rohsBadge,
          x: p.x + p.w - 0.8, y: p.y + 0.3, w: 0.6, h: 0.62
        });
      }

      slide.addText(this.toTitleCase(order.rackName || 'RACK IST'), {
        x: p.x + 0.3, y: p.y + 0.4, w: 1.8, h: 0.4,
        fontFace: 'Century Gothic', fontSize: 12, bold: true, color: '64748B'
      });

      slide.addText(String(parseInt(order.slotNumber || 1) + i), {
        x: p.x + 0.2, y: p.y + 2.0, w: p.w - 0.4, h: 2.2,
        fontFace: 'Century Gothic', fontSize: 90, bold: true, color: '000000', align: 'center', valign: 'middle'
      });

      slide.addText('SLOT', {
        x: p.x + 0.2, y: p.y + 4.4, w: p.w - 0.4, h: 0.8,
        fontFace: 'Century Gothic', fontSize: 28, bold: true, color: '009ADD', align: 'center'
      });

      if (assets.flexLogo) {
        slide.addImage({
          data: assets.flexLogo,
          x: p.x + p.w - 1.1, y: p.y + p.h - 0.7, w: 0.85, h: 0.42
        });
      }
    }
  }

  /* 5. Carro / Rack Viajero Reutilizable (Slides 29 y 30): Formato Limpio para Llenado Manual */
  buildPptxTravelerSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const cardPositions = [
      { x: 0.49, y: 0.45, w: 4.92, h: 3.54 },
      { x: 5.59, y: 0.45, w: 4.92, h: 3.54 },
      { x: 0.49, y: 4.30, w: 4.92, h: 3.54 },
      { x: 5.59, y: 4.30, w: 4.92, h: 3.54 }
    ];

    const isRack = (order.travelerType === 'Rack');
    const headerTitle = isRack ? 'RACK' : 'CARRO';

    const qty = order.qty || 4;
    const totalSlides = Math.ceil(qty / 4);
    let placed = 0;

    for (let s = 0; s < totalSlides; s++) {
      const slide = pptx.addSlide();

      for (let pos = 0; pos < 4 && placed < qty; pos++, placed++) {
        const p = cardPositions[pos];

        // Marco oficial azul
        slide.addShape(shapeRect, {
          x: p.x, y: p.y, w: p.w, h: p.h,
          line: { color: '009ADD', width: 3.0 },
          fill: { color: 'FFFFFF' }
        });

        // Título del tipo
        slide.addText(headerTitle, {
          x: p.x + 0.35, y: p.y + 0.20, w: 2.50, h: 0.50,
          fontFace: 'Century Gothic', fontSize: 22, bold: true, color: '000000'
        });

        // RoHS en esquina superior derecha
        if (assets.rohsBadge) {
          slide.addImage({
            data: assets.rohsBadge,
            x: p.x + 4.10, y: p.y + 0.15, w: 0.62, h: 0.64
          });
        }

        // Líneas para llenado manual con marcador borrable
        // Según Slide 29 (Carro): Área, Encargado, Origen, Destino, Qty
        // Según Slide 30 (Rack): Área, Encargado, Destino, Qty (sin Origen)
        const lineLabels = isRack 
          ? [
              'Área: ____________________________________',
              'Encargado: ________________________________',
              'Destino: __________________________________',
              'Qty: ______________________________________'
            ]
          : [
              'Área: ____________________________________',
              'Encargado: ________________________________',
              'Origen: ___________________________________',
              'Destino: __________________________________',
              'Qty: ______________________________________'
            ];

        slide.addText(lineLabels.join('\n\n'), {
          x: p.x + 0.35, y: p.y + 0.85, w: 4.25, h: 1.65,
          fontFace: 'Century Gothic', fontSize: isRack ? 12.5 : 11.5, bold: true, color: '000000', lineSpacing: isRack ? 22 : 18
        });

        // Recuadro para Sello de Calidad / Autorización
        slide.addShape(shapeRect, {
          x: p.x + 0.35, y: p.y + 2.65, w: 1.90, h: 0.68,
          line: { color: '94A3B8', width: 0.8, dashType: 'dash' },
          fill: { color: 'F8FAFC' }
        });

        slide.addText('Sello / Autorización', {
          x: p.x + 0.35, y: p.y + 2.78, w: 1.90, h: 0.40,
          fontFace: 'Century Gothic', fontSize: 8.5, color: '94A3B8', align: 'center', valign: 'middle'
        });

        // Nota aclaratoria de uso al pie
        const noteText = isRack 
          ? 'Solo usar en racks destinados a almacenamiento de WIP'
          : 'Solo usar en carros para transporte de WIP';

        slide.addText(noteText, {
          x: p.x + 0.35, y: p.y + 3.32, w: 3.50, h: 0.18,
          fontFace: 'Century Gothic', fontSize: 6.5, italic: true, color: '64748B'
        });

        // Logo Flex oficial en esquina inferior derecha
        if (assets.flexLogo) {
          slide.addImage({
            data: assets.flexLogo,
            x: p.x + 3.90, y: p.y + 2.85, w: 0.85, h: 0.45
          });
        }
      }
    }
  }

  /* 6. Letrero Aéreo (Slides 21-23) */
  buildPptxAerialSlides(pptx, order, assets) {
    const shapeRect = (pptx.shapes && pptx.shapes.RECTANGLE) || (pptx.ShapeType && pptx.ShapeType.rect) || 'rect';
    const slide = pptx.addSlide();
    const p = { x: 0.75, y: 1.50, w: 9.50, h: 5.50 };

    slide.addShape(shapeRect, {
      x: p.x, y: p.y, w: p.w, h: p.h,
      fill: { color: 'FFFFFF' },
      line: { color: '004F8A', width: 4.0 }
    });

    slide.addShape(shapeRect, {
      x: p.x, y: p.y, w: p.w, h: 1.20,
      fill: { color: '004F8A' },
      line: { color: '004F8A', width: 0 }
    });

    slide.addText('FLEX VISUAL MANAGEMENT', {
      x: p.x + 0.40, y: p.y + 0.20, w: p.w - 0.80, h: 0.80,
      fontFace: 'Century Gothic', fontSize: 24, bold: true, color: 'FFFFFF', align: 'left', valign: 'middle'
    });

    const aerialEn = this.toTitleCase(order.aerialNameEn || 'PCR Lines');
    const aerialEs = this.toTitleCase(order.aerialNameEs || 'Lineas de PCR');

    slide.addText(aerialEn, {
      x: p.x + 0.40, y: p.y + 1.80, w: p.w - 0.80, h: 1.50,
      fontFace: 'Century Gothic', fontSize: 52, bold: true, color: '000000', align: 'center', valign: 'middle'
    });

    slide.addText(aerialEs, {
      x: p.x + 0.40, y: p.y + 3.40, w: p.w - 0.80, h: 1.00,
      fontFace: 'Century Gothic', fontSize: 32, bold: true, color: '009ADD', align: 'center', valign: 'middle'
    });

    if (assets.flexLogo) {
      slide.addImage({
        data: assets.flexLogo,
        x: p.x + p.w - 1.80, y: p.y + p.h - 0.90, w: 1.50, h: 0.70
      });
    }
  }

  batchExportStationsPptx() {
    const stationOrders = this.orders.filter(o => o.category === 'station');
    if (stationOrders.length === 0) {
      alert('No hay identificaciones de estación registradas para exportar.');
      return;
    }

    try {
      const PptxClass = window.PptxGenJS || (typeof PptxGenJS !== 'undefined' ? PptxGenJS : null) || (typeof pptxgen !== 'undefined' ? pptxgen : null);
      if (!PptxClass) {
        alert('Error: Librería PowerPoint no cargada.');
        return;
      }
      const pptx = new PptxClass();
      pptx.defineLayout({ name: 'LETTER_LANDSCAPE', width: 11.0, height: 8.5 });
      pptx.layout = 'LETTER_LANDSCAPE';

      const assets = window.FLEX_ASSETS || {};

      stationOrders.forEach(order => {
        this.buildPptxStationSlides(pptx, order, assets);
      });

      const filename = `Lote_Estaciones_Flex_${new Date().toISOString().slice(0, 10)}.pptx`;
      pptx.writeFile({ fileName: filename })
        .then(() => {
          this.showToast(`📥 Descargando lote completo: ${filename}`);
        })
        .catch(err => {
          alert('Error al descargar lote: ' + err.message);
        });

    } catch (e) {
      console.error('Error batch pptx', e);
      alert('Error al generar lote en PowerPoint.');
    }
  }

  /* ========================================================================
     MODALS & ORDER DETAIL
     ======================================================================== */
  showOrderDetail(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    const modalBody = document.getElementById('modal-order-body');
    document.getElementById('modal-order-title').textContent = `Pedido ${order.id}`;

    const isMulti = order.items && order.items.length > 1;
    let mainTitle = isMulti
      ? `Lote de ${order.items.length} identificaciones (${order.totalQty || order.qty} pzas)`
      : (order.nameEn || order.partNumber || order.aerialName || order.laptopName || order.officeName || order.slotNumber || (order.items && order.items[0]?.title) || 'Señal');

    let subTitle = isMulti
      ? `${order.items.length} tipo(s) de identificación solicitadas`
      : (order.nameEs || order.commonName || (order.items && order.items[0]?.subtitle) || order.lineArea || '');

    let itemsBreakdownHtml = '';
    if (order.items && order.items.length > 0) {
      itemsBreakdownHtml = `
        <div style="margin-bottom:16px;">
          <h5 style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">
            Identificaciones en este Pedido (${order.items.length}):
          </h5>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${order.items.map((it, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:6px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:1.2rem;">${it.icon || '🏷️'}</span>
                  <div>
                    <div style="font-weight:700; font-size:0.88rem; color:var(--navy-dark);">${idx + 1}. ${it.title}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${it.subtitle}</div>
                  </div>
                </div>
                <span class="badge-counter" style="font-size:0.82rem; padding:3px 8px;">${it.qty} pzas</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const supportsPptx = (order.items && order.items.some(it => ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(it.category))) ||
      ['station', 'bin', 'scrap', 'slot', 'traveler', 'aerial'].includes(order.category);

    modalBody.innerHTML = `
      <div style="margin-bottom:14px;">
        <h4 style="font-size:1.15rem; font-weight:800; color:var(--navy-dark);">${mainTitle}</h4>
        <p style="color:var(--text-muted); font-size:0.85rem;">${subTitle}</p>
      </div>

      <div style="background:var(--bg-subtle); padding:12px 16px; border-radius:var(--radius-sm); margin-bottom:14px; font-size:0.85rem; line-height:1.6;">
        <div>Solicitante: <strong>${order.requester?.name || 'No especificado'}</strong></div>
        <div>Correo: <strong>${order.requester?.email || 'No especificado'}</strong></div>
        <div>Entrega en: <strong>${order.lineArea}</strong></div>
        <div>Prioridad: <strong>${order.requester?.priority || 'Normal'}</strong></div>
        <div>Piezas Totales: <strong>${order.totalQty || order.qty || 1} pzas</strong></div>
        ${order.requester?.notes ? `<div>Notas: <em>"${order.requester.notes}"</em></div>` : ''}
      </div>

      ${itemsBreakdownHtml}

      <div style="margin-bottom:18px;">
        <h5 style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px;">Subprocesos:</h5>
        ${order.processes?.map((p, idx) => `
          <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#fff; border:1px solid var(--border-subtle); border-radius:4px; margin-bottom:4px; font-size:0.82rem;">
            <span>${idx + 1}. ${p.name}</span>
            <span style="font-weight:700; color:${p.completed ? '#10b981' : '#f59e0b'};">
              ${p.completed ? '✅ Realizado' : '⏳ Pendiente'}
            </span>
          </div>
        `).join('')}
      </div>

      <div style="display:flex; gap:10px;">
        ${supportsPptx ? `
          <button class="btn btn-primary" onclick="app.generatePptxByOrderId('${order.id}')">
            <span>📥</span> Descargar PowerPoint (${order.totalQty || order.qty || 1} pzas)
          </button>
        ` : ''}
        <button class="btn btn-secondary" onclick="app.quickTrack('${order.id}'); app.closeModal('modal-order-detail'); app.switchTab('track');">
          🔍 Rastrear Pedido
        </button>
      </div>
    `;

    this.openModal('modal-order-detail');
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  }

  /* ========================================================================
     METRICS & SYSTEM STATS
     ======================================================================== */
  updateMetrics() {
    const total = this.orders.length;
    const pending = this.orders.filter(o => o.status === 'pending').length;
    const process = this.orders.filter(o => o.status === 'process').length;
    const completed = this.orders.filter(o => o.status === 'ready' || o.status === 'delivered').length;

    const elTotal = document.getElementById('metric-total-orders');
    const elPending = document.getElementById('metric-pending-orders');
    const elProcess = document.getElementById('metric-process-orders');
    const elCompleted = document.getElementById('metric-completed-orders');

    if (elTotal) elTotal.textContent = total;
    if (elPending) elPending.textContent = pending;
    if (elProcess) elProcess.textContent = process;
    if (elCompleted) elCompleted.textContent = completed;
  }

  exportOrdersJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.orders, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `flex_signage_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  resetSampleData() {
    if (confirm('¿Restablecer los pedidos a los ejemplos de muestra?')) {
      localStorage.removeItem(this.storageKey);
      this.loadSampleData();
      this.renderKanban();
      this.renderTrackingRecent();
      this.updateMetrics();
      this.showToast('🔄 Ejemplos restablecidos.');
    }
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div style="font-size:1.1rem; color:var(--flex-blue);">🔔</div>
      <div style="font-size:0.86rem; font-weight:600; color:var(--navy-dark);">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new FlexSignageApp();
});
