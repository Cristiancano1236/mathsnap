/*
  Archivo: assets/js/app.js
  Propósito: Lógica principal de la app: UI, cámara, OCR, parseo y resolución.
  Relación: Manipula elementos de index.html y usa estilos de assets/css/styles.css.
  Dependencias globales: Tesseract, math (math.js), mathsteps.
*/

(() => {
  // Utilidades DOM
  /** Selecciona un elemento por id */
  const $ = (id) => document.getElementById(id);

  // Elementos principales
  const fileInput = $("fileInput");
  const previewImg = $("preview");
  const canvas = $("canvas");
  const processedPreview = $("processedPreview");
  const video = $("video");
  const startCameraBtn = $("startCameraBtn");
  const stopCameraBtn = $("stopCameraBtn");
  const captureBtn = $("captureBtn");
  const solveBtn = $("solveBtn");
  const clearBtn = $("clearBtn");
  const exportPdfBtn = $("exportPdfBtn");
  const manualInput = $("manualInput");
  const ocrText = $("ocrText");
  const stepsList = $("stepsList");
  const statusArea = $("statusArea");
  const resultsCard = $("resultsCard");
  const tabUploadBtn = $("tabUploadBtn");
  const tabCameraBtn = $("tabCameraBtn");
  const uploadSection = $("uploadSection");
  const cameraSection = $("cameraSection");
  const ocrMode = $("ocrMode");
  const enhanceToggle = $("enhanceToggle");

  // Estado de cámara
  let mediaStream = null;
  // Track de ObjectURL para liberar al cambiar
  let lastObjectUrl = null;

  // Helpers de UI
  function setStatus(message, type = "info", withSpinner = false) {
    const spinner = withSpinner
      ? '<span class="spinner-border spinner-border-sm status-spinner me-2" role="status" aria-hidden="true"></span>'
      : "";
    statusArea.innerHTML = `<div class="alert alert-${type} d-flex align-items-center" role="alert">${spinner}<div>${message}</div></div>`;
  }

  function clearStatus() {
    statusArea.innerHTML = "";
  }

  function clearResults() {
    ocrText.textContent = "";
    stepsList.innerHTML = "";
  }

  function switchMode(mode) {
    if (mode === "upload") {
      uploadSection.classList.remove("d-none");
      cameraSection.classList.add("d-none");
      tabUploadBtn.classList.add("active");
      tabCameraBtn.classList.remove("active");
    } else {
      uploadSection.classList.add("d-none");
      cameraSection.classList.remove("d-none");
      tabUploadBtn.classList.remove("active");
      tabCameraBtn.classList.add("active");
    }
  }

  // Cargar imagen local
  fileInput.addEventListener("change", async (ev) => {
    clearStatus();
    clearResults();
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (lastObjectUrl) {
      try { URL.revokeObjectURL(lastObjectUrl); } catch (_) {}
      lastObjectUrl = null;
    }
    const url = URL.createObjectURL(file);
    lastObjectUrl = url;
    setPreview(url);
    // limpiar imagen procesada
    if (processedPreview) {
      processedPreview.classList.add("d-none");
      processedPreview.removeAttribute("src");
    }
  });

  // Cámara: iniciar
  async function startCamera() {
    try {
      if (mediaStream) return; // ya iniciada
      setStatus("Solicitando acceso a la cámara...", "info", true);
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = mediaStream;
      captureBtn.disabled = false;
      stopCameraBtn.disabled = false;
      startCameraBtn.disabled = true;
      setStatus("Cámara lista. Enfoca el problema y captura.", "success");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo acceder a la cámara. Revisa permisos o usa Subir.", "danger");
    }
  }

  // Cámara: detener
  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    video.srcObject = null;
    captureBtn.disabled = true;
    stopCameraBtn.disabled = true;
    startCameraBtn.disabled = false;
    clearStatus();
  }

  // Cámara: capturar frame a canvas e imagen
  function captureFrame() {
    if (!video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    setPreview(dataUrl);
    if (processedPreview) {
      processedPreview.classList.add("d-none");
      processedPreview.removeAttribute("src");
    }
  }

  startCameraBtn.addEventListener("click", startCamera);
  stopCameraBtn.addEventListener("click", stopCamera);
  captureBtn.addEventListener("click", () => {
    captureFrame();
    setStatus("Imagen capturada. Puedes resolver ahora.", "success");
  });

  tabUploadBtn.addEventListener("click", () => switchMode("upload"));
  tabCameraBtn.addEventListener("click", () => switchMode("camera"));

  // OCR usando Tesseract.js
  async function runOCRFromPreview() {
    const src = previewImg.src;
    if (!src) throw new Error("No hay imagen para OCR");
    setStatus("Ejecutando OCR (Tesseract.js)...", "info", true);
    // Preprocesamiento si está activo
    let imageForOCR = src;
    if (enhanceToggle?.checked) {
      imageForOCR = await preprocessImage(src);
    }
    const psmMap = { auto: 3, block: 3, line: 7 };
    const { data } = await Tesseract.recognize(imageForOCR, "spa+eng", {
      tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/^()=., ",
      // Control de segmentación de página
      tessedit_pageseg_mode: psmMap[ocrMode?.value || "auto"]
    });
    const text = (data && data.text) ? data.text.trim() : "";
    if (!text) throw new Error("OCR no detectó texto utilizable");
    setStatus("OCR completado. Revisa el texto reconocido.", "success");
    return text;
  }

  // Preprocesamiento: escala, grises y umbral (Otsu) en un canvas offscreen
  async function preprocessImage(src) {
    const img = await loadImage(src);
    const off = document.createElement("canvas");
    const ctx = off.getContext("2d");
    // Escala a ancho máximo 1200 para mejorar OCR sin perder nitidez
    const maxW = 1200;
    const ratio = img.width ? Math.min(1, maxW / img.width) : 1;
    off.width = Math.floor((img.width || 800) * ratio);
    off.height = Math.floor((img.height || 600) * ratio);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, off.width, off.height);
    const imageData = ctx.getImageData(0, 0, off.width, off.height);
    const bin = otsuBinarize(imageData);
    ctx.putImageData(bin, 0, 0);
    const url = off.toDataURL("image/png");
    if (processedPreview) {
      processedPreview.src = url;
      processedPreview.classList.remove("d-none");
    }
    return url;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function otsuBinarize(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      gray[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    // Histograma
    const hist = new Array(256).fill(0);
    for (let k = 0; k < gray.length; k += 1) hist[gray[k]] += 1;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 0;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t]; if (wB === 0) continue;
      wF = total - wB; if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) { varMax = between; threshold = t; }
    }
    // Aplicar umbral
    const out = ctxFrom(imageData);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
      const v = gray[j] > threshold ? 255 : 0;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    return out;
  }

  function ctxFrom(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width; c.height = imageData.height;
    const cctx = c.getContext("2d");
    const out = cctx.createImageData(imageData.width, imageData.height);
    return out;
  }

  // Normaliza texto a una expresión/ecuación parsable
  function normalizeMathText(text) {
    if (!text) return "";
    let expr = text
      .replace(/\s+/g, " ") // espacios simples
      .replace(/[×]/g, "*") // símbolo de multiplicación
      .replace(/\bX\b/g, "x") // X mayúscula a x
      .replace(/[–—]/g, "-") // guiones
      .replace(/,\s*/g, "."); // coma decimal a punto
    // normalizar funciones y constantes (soporta español)
    expr = expr.replace(/sen/gi, "sin");
    expr = expr.replace(/seno/gi, "sin");
    expr = expr.replace(/coseno/gi, "cos");
    expr = expr.replace(/tg/gi, "tan");
    expr = expr.replace(/tangente/gi, "tan");
    expr = expr.replace(/raiz/gi, "sqrt");
    expr = expr.replace(/PI/g, "pi");
    // raíz con símbolo √
    expr = expr.replace(/√\s*\(/g, "sqrt(");
    expr = expr.replace(/√\s*(\d+(?:\.\d+)?)/g, "sqrt($1)");
    // Superíndices unicode a potencia ^n
    expr = replaceUnicodeSuperscripts(expr);
    // eliminar caracteres no deseados al inicio/fin
    expr = expr.replace(/^[^0-9a-zA-Z(]+/, "").replace(/[^0-9a-zA-Z)]+$/, "");
    return expr;
  }

  function replaceUnicodeSuperscripts(s) {
    const map = {
      "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
      "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9"
    };
    return s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (m) => `^${map[m]}`);
  }

  // Inserta multiplicación implícita básica previa al mapeo de variable: 2x -> 2*x, 2(x+1)->2*(x+1), )(->)*(
  function insertImplicitMultiplication(expr) {
    let out = expr;
    // número seguido de letra o '('
    out = out.replace(/(\d)([a-zA-Z(])/g, "$1*$2");
    // )(
    out = out.replace(/\)(\()/g, ")*(");
    return out;
  }

  // Detecta variable principal (una sola letra distinta de e, pi) y mapea a x en límites no alfabéticos
  function mapPrimaryVariableToX(expr) {
    // Extrae tokens alfabéticos
    const tokens = expr.match(/[a-zA-Z]+/g) || [];
    const singleLetterVars = tokens
      .filter((t) => t.length === 1)
      .map((t) => t.toLowerCase())
      .filter((t) => !["e", "i"].includes(t));
    const unique = Array.from(new Set(singleLetterVars));
    const primary = unique.length === 1 ? unique[0] : null;
    if (!primary || primary === "x") return { mapped: expr, originalVar: primary };
    // Reemplazo en límites no alfabéticos
    const mapped = expr.replace(new RegExp(`(^|[^a-zA-Z])${primary}([^a-zA-Z]|$)`, "g"), (m, p1, p2) => `${p1}x${p2}`);
    return { mapped, originalVar: primary };
  }

  function replaceVariableForDisplay(str, originalVar) {
    if (!originalVar || originalVar === "x") return str;
    // Reemplaza x como variable aislada (evita palabras más largas)
    return str.replace(/\bx\b/g, originalVar);
  }

  // Resolver usando mathsteps (si es ecuación o simplificación) o math.js (evaluación)
  function solveExpressionOrEquation(raw) {
    let input = raw.trim();
    input = insertImplicitMultiplication(input);
    const { mapped, originalVar } = mapPrimaryVariableToX(input);
    input = mapped;
    // multiplicación implícita adicional tras mapear a x
    input = input.replace(/x\(/g, "x*(");
    input = input.replace(/\)x/g, ")*x");
    // Intento de ecuación
    if (input.includes("=")) {
      // Fallback propio para ecuaciones lineales de 1 variable con pasos
      const custom = trySolveLinearEquationWithSteps(input);
      if (custom) {
        return { mode: "equation", steps: custom, originalVar };
      }
      try {
        const steps = mathsteps.solveEquation(input);
        return { mode: "equation", steps, originalVar };
      } catch (e) {
        // fallback a simplificación de ambos lados o evaluación
      }
    }
    // Intento de simplificación paso a paso
    try {
      const steps = mathsteps.simplifyExpression(input);
      if (steps && steps.length) {
        return { mode: "simplify", steps, originalVar };
      }
    } catch (e) {
      // continúa al fallback
    }
    // Mini pasos para funciones comunes (sqrt, potencias) cuando sea posible
    const mini = tryEvaluateMiniSteps(input);
    if (mini && mini.length) {
      return { mode: "simplify", steps: mini, originalVar };
    }
    // Fallback final: evaluación numérica con math.js
    try {
      const value = math.evaluate(input);
      return { mode: "evaluate", value };
    } catch (e) {
      throw new Error("No se pudo interpretar la expresión. Corrige manualmente.");
    }
  }

  // Render de pasos
  function renderSteps(result) {
    stepsList.innerHTML = "";
    if (!result) return;
    // Helpers LaTeX
    function toTexSafe(exprStr) {
      try { return math.parse(String(exprStr)).toTex(); } catch (_) { return String(exprStr); }
    }
    function typeset() {
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([stepsList]).catch(() => {});
      }
    }
    if (result.mode === "evaluate") {
      const item = document.createElement("li");
      item.className = "list-group-item d-flex justify-content-between align-items-center";
      const tex = toTexSafe(result.value);
      item.innerHTML = `<span class="step-expression">Resultado</span><span class="badge text-bg-primary">${tex}</span>`;
      stepsList.appendChild(item);
      typeset();
      return;
    }
    if (result.mode === "system") {
      const header = document.createElement("li");
      header.className = "list-group-item";
      const sys = result.systemLatex.map((t) => `\\(${t}\\)`).join("<br/>");
      const sol = Object.entries(result.solution).map(([k,v]) => `\\(${k} = ${v}\\)`).join("<br/>");
      header.innerHTML = `<div class="mb-2"><strong>Sistema interpretado</strong><div>${sys}</div></div>`+
        `<div><strong>Solución</strong><div>${sol}</div></div>`;
      stepsList.appendChild(header);
      typeset();
      return;
    }
    const steps = result.steps || [];
    if (!steps.length) {
      const item = document.createElement("li");
      item.className = "list-group-item";
      item.textContent = "No hay pasos disponibles para mostrar.";
      stepsList.appendChild(item);
      typeset();
      return;
    }
    steps.forEach((s, index) => {
      let before = s.oldNode ? s.oldNode.toString() : s.oldExpression?.toString?.() || s.oldExpression || "";
      let after = s.newNode ? s.newNode.toString() : s.newExpression?.toString?.() || s.newExpression || "";
      if (result.originalVar) {
        before = replaceVariableForDisplay(before, result.originalVar);
        after = replaceVariableForDisplay(after, result.originalVar);
      }
      const change = s.changeType || s.substitution ? (s.changeType || "Cambio") : "Paso";
      const li = document.createElement("li");
      li.className = "list-group-item";
      const beforeTex = toTexSafe(before);
      const afterTex = toTexSafe(after);
      li.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <div class="small text-muted">Paso ${index + 1}: ${change}</div>
            <div class="step-expression">\\(${beforeTex}\\)</div>
            <i class="bi bi-arrow-down-short"></i>
            <div class="step-expression">\\(${afterTex}\\)</div>
          </div>
          <span class="badge text-bg-secondary align-self-start">${result.mode}</span>
        </div>
      `;
      stepsList.appendChild(li);
    });
    typeset();
  }

  // Acción principal: Resolver
  solveBtn.addEventListener("click", async () => {
    try {
      clearStatus();
      clearResults();
      // 1) Preferir entrada manual si está llena
      let rawInput = manualInput.value.trim();
      if (!rawInput) {
        // 2) Si no, intentar OCR desde la vista previa
        const text = await runOCRFromPreview();
        ocrText.textContent = text;
        rawInput = normalizeMathText(text);
      } else {
        // normalizar entrada manual también
        rawInput = normalizeMathText(rawInput);
      }
      // Detección de sistema por líneas o ';'
      const lines = rawInput.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
      if (lines.length >= 2 && lines.every((l) => l.includes("="))) {
        setStatus("Resolviendo sistema lineal...", "info", true);
        const sysResult = solveLinearSystem(lines);
        renderSteps(sysResult);
        setStatus("Sistema resuelto.", "success");
        return;
      }
      if (!rawInput) throw new Error("No hay entrada válida. Sube/captura imagen o escribe manualmente.");
      // 3) Resolver
      setStatus("Resolviendo paso a paso...", "info", true);
      const result = solveExpressionOrEquation(rawInput);
      // 4) Mostrar
      renderSteps(result);
      setStatus("Resolución finalizada.", "success");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Error inesperado al resolver.", "danger");
    }
  });

  // Limpiar
  clearBtn.addEventListener("click", () => {
    clearStatus();
    clearResults();
    previewImg.removeAttribute("src");
    previewImg.classList.add("d-none");
    if (processedPreview) {
      processedPreview.classList.add("d-none");
      processedPreview.removeAttribute("src");
    }
    // limpiar input de archivo y revocar URL
    if (fileInput) {
      fileInput.value = "";
    }
    if (lastObjectUrl) {
      try { URL.revokeObjectURL(lastObjectUrl); } catch (_) {}
      lastObjectUrl = null;
    }
    // limpiar canvas
    if (canvas) {
      canvas.width = 0; canvas.height = 0;
    }
    manualInput.value = "";
  });

  // Estado inicial
  switchMode("upload");
  // Año footer
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Manejo de vista previa para evitar ícono roto
  function setPreview(src) {
    if (!src) {
      previewImg.removeAttribute("src");
      previewImg.classList.add("d-none");
      return;
    }
    // Limpia handlers previos
    previewImg.onload = null;
    previewImg.onerror = null;
    // Forzar recarga incluso si el src es igual
    const isMemoryUrl = /^data:|^blob:/i.test(src);
    const targetSrc = isMemoryUrl ? src : `${src}${src.includes("?") ? "&" : "?"}_=${Date.now()}`;
    previewImg.classList.add("d-none");
    previewImg.onload = () => {
      previewImg.classList.remove("d-none");
    };
    previewImg.onerror = () => {
      previewImg.classList.add("d-none");
      console.warn("Fallo al cargar la vista previa");
    };
    previewImg.src = targetSrc;
  }

  // Resolver sistemas lineales Ax = b (método de evaluación de base estándar)
  function solveLinearSystem(equations) {
    // Normalizar e identificar variables
    const norm = equations.map((e) => insertImplicitMultiplication(normalizeMathText(e)));
    const varSet = new Set();
    norm.forEach((eq) => (eq.match(/[a-zA-Z]/g) || []).forEach((c) => /[a-zA-Z]/.test(c) && varSet.add(c.toLowerCase())));
    const vars = Array.from(varSet).sort();
    if (vars.length === 0) throw new Error("No se detectaron variables en el sistema.");
    const A = [];
    const b = [];
    const systemLatex = [];
    norm.forEach((eq) => {
      const [lhs, rhs] = eq.split("=");
      // TeX del sistema
      try {
        const tex = `${math.parse(lhs).toTex()} = ${math.parse(rhs).toTex()}`;
        systemLatex.push(tex);
      } catch (_) { systemLatex.push(eq); }
      const expr = math.parse(`(${lhs}) - (${rhs})`);
      // f(variables) = 0
      const zeroEnv = Object.fromEntries(vars.map((v) => [v, 0]));
      const c0 = Number(expr.evaluate(zeroEnv));
      const coeffs = vars.map((v) => {
        const env = { ...zeroEnv, [v]: 1 };
        const f1 = Number(expr.evaluate(env));
        return f1 - c0;
      });
      A.push(coeffs);
      b.push(-c0);
    });
    // Resolver
    const Am = math.matrix(A);
    const bm = math.matrix(b);
    let x;
    try {
      if (A.length === vars.length) {
        x = math.lusolve(Am, bm);
      } else {
        const At = math.transpose(Am);
        x = math.lusolve(math.multiply(At, Am), math.multiply(At, bm));
      }
    } catch (e) {
      throw new Error("El sistema no es lineal o es singular/no resoluble.");
    }
    const sol = {};
    vars.forEach((v, i) => {
      const val = Array.isArray(x._data?.[i]) ? x._data[i][0] : x._data?.[i] ?? x[i];
      sol[v] = Number(Number(val).toFixed(6));
    });
    return { mode: "system", solution: sol, systemLatex };
  }

  // Exportación a PDF
  exportPdfBtn && exportPdfBtn.addEventListener("click", () => {
    if (!resultsCard || typeof html2pdf === "undefined") return;
    const opt = {
      margin: 10,
      filename: "resultado-matematico.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };
    html2pdf().set(opt).from(resultsCard).save();
  });

  // -------------------------
  // Fallback: pasos para ecuaciones lineales de una variable
  // -------------------------
  function trySolveLinearEquationWithSteps(eqStr) {
    try {
      const [lhs, rhs] = eqStr.split("=").map((s) => s.trim());
      if (!lhs || !rhs) return null;
      const vars = Array.from(new Set((eqStr.match(/[a-zA-Z]/g) || []).map((c) => c.toLowerCase())));
      if (vars.length !== 1 || vars[0] !== "x") return null;
      // Detectar linealidad usando tres puntos
      const f = (val) => math.evaluate(lhs, { x: val }) - math.evaluate(rhs, { x: val });
      const y0 = f(0), y1 = f(1), y2 = f(2);
      if (Math.abs((y2 - y1) - (y1 - y0)) > 1e-9) return null; // no lineal
      // ax + c = 0 donde a = f(1) - f(0), c = f(0)
      const a = y1 - y0;
      const c = y0;
      const steps = [];
      // Paso 1: simplificar lados
      const simpL = safeToString(math.simplify(lhs));
      const simpR = safeToString(math.simplify(rhs));
      steps.push({ oldExpression: `${lhs} = ${rhs}`, newExpression: `${simpL} = ${simpR}`, changeType: "Simplificar" });
      // Paso 2: mover términos (ax + c = 0)
      const left = `${formatCoeff(a)}*x + (${c})`;
      steps.push({ oldExpression: `${simpL} - (${simpR}) = 0`, newExpression: `${left} = 0`, changeType: "Trasladar términos" });
      // Paso 3: aislar x
      if (Math.abs(a) < 1e-12) {
        // a = 0 => o sin solución o infinitas
        const condition = Math.abs(c) < 1e-12 ? "Identidad (infinitas soluciones)" : "Inconsistente (sin solución)";
        steps.push({ oldExpression: `${left} = 0`, newExpression: condition, changeType: "Clasificación" });
        return steps;
      }
      const final = -c / a;
      steps.push({ oldExpression: `${formatCoeff(a)}*x = ${-c}`, newExpression: `x = ${final}`, changeType: "Dividir por coeficiente" });
      return steps;
    } catch (_) {
      return null;
    }
  }

  function safeToString(node) {
    try { return node.toString(); } catch { return String(node); }
  }
  function formatCoeff(a) {
    const n = Number(a);
    return Math.abs(n - Math.round(n)) < 1e-12 ? String(Math.round(n)) : String(n);
  }

  // -------------------------
  // Mini pasos para evaluación de expresiones simples (sqrt, potencias, suma/resta)
  // -------------------------
  function tryEvaluateMiniSteps(expr) {
    const steps = [];
    let current = expr;
    // reemplazo iterativo máximo 10 pasos para evitar bucles
    for (let i = 0; i < 10; i += 1) {
      const before = current;
      // sqrt(n)
      const m1 = current.match(/sqrt\(([-+]?[0-9]+(?:\.[0-9]+)?)\)/);
      if (m1) {
        const val = Math.sqrt(parseFloat(m1[1]));
        const next = current.replace(m1[0], String(val));
        steps.push({ oldExpression: before, newExpression: next, changeType: "Evaluar raíz" });
        current = next; continue;
      }
      // potencia n^k con k entero pequeño
      const m2 = current.match(/\b([-+]?[0-9]+(?:\.[0-9]+)?)\s*\^\s*([-+]?[0-9]+)\b/);
      if (m2) {
        const base = parseFloat(m2[1]);
        const exp = parseInt(m2[2], 10);
        const val = Math.pow(base, exp);
        const next = current.replace(m2[0], String(val));
        steps.push({ oldExpression: before, newExpression: next, changeType: "Evaluar potencia" });
        current = next; continue;
      }
      // operaciones básicas +,-,*,/
      try {
        const value = math.evaluate(current);
        if (typeof value === 'number') {
          steps.push({ oldExpression: before, newExpression: String(value), changeType: "Evaluar" });
          current = String(value);
        }
      } catch (_) {}
      if (current === before) break;
    }
    return steps;
  }
})();


