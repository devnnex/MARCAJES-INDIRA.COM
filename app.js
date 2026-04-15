const API = "https://script.google.com/macros/s/AKfycbya9lfXYzFxuv7NdESWlL-jz1Lwmjq4wWr4z-ZYncEbCCzY6SYTYj9DIvlQqp23q-dr/exec";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

const premiumModal = Swal.mixin({
  background: "transparent",
  buttonsStyling: false,
  confirmButtonText: "Entendido",
  customClass: {
    popup: "apple-modal",
    title: "apple-modal-title",
    htmlContainer: "apple-modal-text",
    actions: "apple-modal-actions",
    confirmButton: "apple-modal-btn",
    cancelButton: "apple-modal-btn apple-modal-btn-secondary"
  },
  showClass: {
    popup: "apple-modal-show"
  },
  hideClass: {
    popup: "apple-modal-hide"
  }
});

let currentHourRate = null;
let currentWorkers = [];
let attendanceMode = "single";
let selectedBatchWorkers = new Set();
let adminUnlocked = false;

const ADMIN_PIN = "5678";
const PROTECTED_SECTIONS = new Set(["dashboard", "workers"]);

function formatCOP(value){
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)){
    return COP.format(0);
  }

  return COP.format(Math.round(numericValue));
}

function formatHoursValue(value){
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)){
    return "0";
  }

  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(2).replace(/\.?0+$/, "");
}

function showPremiumModal(options = {}){
  return premiumModal.fire(options);
}

function escapeHTML(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWorkerNameById(workerId){
  const matchedWorker = currentWorkers.find(worker => String(worker.id) === String(workerId));
  return matchedWorker?.name || "Trabajador";
}

function setAttendanceMode(mode = "single"){
  attendanceMode = mode === "multi" ? "multi" : "single";

  const isMulti = attendanceMode === "multi";
  const modeSingleBtn = document.getElementById("modeSingleBtn");
  const modeMultiBtn = document.getElementById("modeMultiBtn");
  const multiWorkerPanel = document.getElementById("multiWorkerPanel");

  if (modeSingleBtn){
    modeSingleBtn.classList.toggle("active", !isMulti);
  }

  if (modeMultiBtn){
    modeMultiBtn.classList.toggle("active", isMulti);
  }

  if (multiWorkerPanel){
    multiWorkerPanel.classList.toggle("visible", isMulti);
    multiWorkerPanel.setAttribute("aria-hidden", String(!isMulti));
  }

  if (isMulti && selectedBatchWorkers.size === 0 && workerSelect.value){
    selectedBatchWorkers.add(String(workerSelect.value));
  }

  renderMultiWorkerList(currentWorkers);
}

function handleBatchWorkerToggle(workerId, isSelected){
  const normalizedId = String(workerId || "").trim();
  if (!normalizedId){
    return;
  }

  if (isSelected){
    selectedBatchWorkers.add(normalizedId);
  } else {
    selectedBatchWorkers.delete(normalizedId);
  }
}

function toggleAllBatchWorkers(shouldSelect){
  const workerIds = currentWorkers.map(worker => String(worker.id));
  selectedBatchWorkers = shouldSelect ? new Set(workerIds) : new Set();
  renderMultiWorkerList(currentWorkers);
}

function renderMultiWorkerList(workers = []){
  const multiWorkerList = document.getElementById("multiWorkerList");
  if (!multiWorkerList){
    return;
  }

  const validWorkers = Array.isArray(workers) ? workers : [];

  if (!validWorkers.length){
    multiWorkerList.innerHTML = `<div class="multi-worker-empty">No hay trabajadores disponibles para seleccion multiple.</div>`;
    return;
  }

  const availableIds = new Set(validWorkers.map(worker => String(worker.id)));
  selectedBatchWorkers = new Set([...selectedBatchWorkers].filter(workerId => availableIds.has(workerId)));

  multiWorkerList.innerHTML = validWorkers.map(worker => {
    const workerId = String(worker.id);
    const workerName = escapeHTML(worker.name || "Sin nombre");
    const statusLabel = worker.active ? "En turno" : "Disponible";
    const checkedAttribute = selectedBatchWorkers.has(workerId) ? "checked" : "";

    return `
      <label class="multi-worker-item">
        <input type="checkbox" class="multi-worker-check" data-worker-id="${escapeHTML(workerId)}" ${checkedAttribute}>
        <span>${workerName} - ${statusLabel}</span>
      </label>
    `;
  }).join("");

  multiWorkerList.querySelectorAll(".multi-worker-check").forEach(input => {
    input.addEventListener("change", event => {
      const target = event.currentTarget;
      handleBatchWorkerToggle(target.dataset.workerId, target.checked);
    });
  });
}

function getRateElements(){
  return {
    currentRateLabel: document.getElementById("currentRateValue"),
    rateInput: document.getElementById("hourRate")
  };
}

function clearRateInput(){
  const rateInput = document.getElementById("hourRate");
  if (rateInput){
    rateInput.value = "";
  }
}

function renderCurrentRate(value){
  const currentRateLabel = document.getElementById("currentRateValue");
  const currentRateDisplay = document.getElementById("currentRateDisplay");
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0){
    return;
  }

  const formattedRate = formatCOP(numericValue);

  if (currentRateLabel){
    currentRateLabel.textContent = formattedRate;
    currentRateLabel.innerText = formattedRate;
    currentRateLabel.setAttribute("data-rate-value", String(numericValue));
  }

  if (currentRateDisplay){
    currentRateDisplay.textContent = formattedRate;
    currentRateDisplay.innerText = formattedRate;
    currentRateDisplay.setAttribute("data-rate-value", String(numericValue));
  }
}

function getWorkerFormFields(){
  return {
    nameInput: document.getElementById("name"),
    phoneInput: document.getElementById("phone"),
    emailInput: document.getElementById("email")
  };
}

function wait(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatMinutes(mins){
  if (mins < 60) return mins + " min";

  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return m === 0 ? `${h}h` : `${h}h ${m} m`;
}

function toggleRateBoxVisibility(sectionId){
  const rateBox = document.getElementById("rateBox");
  if (!rateBox){
    return;
  }

  rateBox.classList.toggle("hidden-by-section", sectionId === "time");
}

function setActiveSectionUI(id){
  document.querySelectorAll(".section")
    .forEach(section => section.classList.remove("active"));

  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".sidebar .nav-btn")
    .forEach(button => button.classList.toggle("active", button.dataset.section === id));
  toggleRateBoxVisibility(id);
}

function isProtectedSection(id){
  return PROTECTED_SECTIONS.has(id);
}

async function requestAdminAccess(){
  const { isConfirmed, value } = await showPremiumModal({
    title: "PIN de administrador",
    html: `
      <div class="apple-modal-form">
        <label class="apple-modal-field">
          <span>Ingresa el PIN de 4 digitos</span>
          <input id="adminPinInput" class="apple-modal-input-field" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="****">
        </label>
      </div>
    `,
    confirmButtonText: "Ingresar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    allowOutsideClick: false,
    allowEscapeKey: false,
    focusConfirm: false,
    didOpen: () => {
      const pinInput = document.getElementById("adminPinInput");
      if (pinInput){
        pinInput.focus();
        pinInput.addEventListener("input", () => {
          pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
        });
      }
    },
    preConfirm: () => {
      const pinInput = document.getElementById("adminPinInput");
      const pinValue = (pinInput?.value || "").replace(/\D/g, "").slice(0, 4);

      if (pinValue.length !== 4){
        Swal.showValidationMessage("El PIN debe tener 4 digitos.");
        return false;
      }

      return pinValue;
    }
  });

  if (!isConfirmed){
    return false;
  }

  if (value !== ADMIN_PIN){
    await showPremiumModal({
      icon: "error",
      title: "PIN incorrecto",
      text: "No tienes permisos para entrar a esta seccion."
    });
    return false;
  }

  adminUnlocked = true;
  await showPremiumModal({
    icon: "success",
    title: "Acceso concedido",
    text: "Ya puedes entrar a Dashboard y Trabajadores."
  });
  return true;
}

async function showSection(id){
  if (isProtectedSection(id) && !adminUnlocked){
    const hasAccess = await requestAdminAccess();
    if (!hasAccess){
      if (id !== "time"){
        setActiveSectionUI("time");
        await loadWorkers();
        await loadTimeLogs({ showLoader: false });
      }
      return;
    }
  }

  setActiveSectionUI(id);

  if (id === "workers"){
    await loadWorkers();
  }

  if (id === "dashboard"){
    await loadDashboard();
  }

  if (id === "time"){
    await loadWorkers();
    await loadTimeLogs({ showLoader: false });
  }
}

async function api(action, data = {}){
  const res = await fetch(API, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ action, ...data })
  });

  return res.json();
}

async function addWorker(){
  const { nameInput, phoneInput, emailInput } = getWorkerFormFields();
  const previousCount = currentWorkers.length;
  const payload = {
    name: nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim()
  };

  if (!payload.name){
    showPremiumModal({
      icon: "warning",
      title: "Nombre requerido",
      text: "Ingresa al menos el nombre del trabajador antes de guardar."
    });
    return;
  }

  setGlobalLoader(true, {
    title: "Guardando trabajador",
    text: "Estamos registrando al trabajador y actualizando la vista."
  });

  try {
    const result = await api("addWorker", payload);
    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";

    insertOptimisticWorker(result, payload);
    await loadWorkers();
    await syncWorkersUI({
      loaderTitle: "Actualizando trabajadores",
      loaderText: "Estamos sincronizando la lista para mostrar el nuevo registro.",
      attempts: 10,
      delayMs: 500,
      match: workers => workers.length > previousCount
    });
    await loadDashboard();

    showPremiumModal({
      icon: "success",
      title: "Trabajador guardado",
      text: `${payload.name} ya aparece en la lista actualizada.`
    });
  } finally {
    setGlobalLoader(false);
  }
}

async function getWorkersData(){
  return api("getWorkers");
}

function renderWorkers(workers = currentWorkers){
  currentWorkers = Array.isArray(workers) ? workers : [];
  const searchInput = document.getElementById("workerSearch");
  const cardsContainer = document.getElementById("workersCards");
  const q = (searchInput?.value || "").toLowerCase();

  const filtered = currentWorkers.filter(worker =>
    (worker.name || "").toLowerCase().includes(q)
  );

  cardsContainer.innerHTML = filtered.map(worker => {
    const maxHours = 48;
    const progress = Math.min((worker.hours / maxHours) * 100, 100);
    const money = formatCOP(worker.pay || 0);
    const liqDate = worker.lastLiquidation
      ? new Date(worker.lastLiquidation).toLocaleDateString("es-CO", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric"
        })
      : "Sin liquidar";

    const status = worker.active
      ? `<div style="color:#00e676;font-weight:bold">EN TURNO</div>`
      : `<div style="color:#9e9e9e">Fuera de turno</div>`;

    const timer = worker.active
      ? `<div class="liveTimer" data-start="${worker.activeStart}"></div>`
      : "";

    return `
      <div class="worker-card">
        <div class="worker-header">
          <span>${worker.name}</span>
          <span>${money}</span>
        </div>

        <div>Dias trabajados: ${worker.days || 0}</div>

        ${status}
        ${timer}

        <div class="progress-bar">
          <div class="progress" style="width:${progress}%"></div>
        </div>

        <div style="color:#00c853;font-size:12px;margin-top:6px">
          Ultima liquidacion: ${liqDate}
        </div>

        <div class="card-actions">
          <button class="liquidate-btn" onclick="liquidate('${worker.id}')">Liquidar</button>
          <button class="delete-btn" onclick="deleteWorker('${worker.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join("");

  fillWorkerSelects(currentWorkers);
}

function handleWorkerSearch(){
  renderWorkers(currentWorkers);
}

async function loadWorkers(){
  const workers = await getWorkersData();
  renderWorkers(workers);
  return workers;
}

async function refreshWorkers(){
  setGlobalLoader(true, {
    title: "Refrescando trabajadores",
    text: "Estamos cargando la lista mas reciente desde el backend."
  });

  try {
    await loadWorkers();
  } finally {
    setGlobalLoader(false);
  }
}

async function syncWorkersUI({
  match,
  attempts = 6,
  delayMs = 450,
  loaderTitle = "Actualizando trabajadores",
  loaderText = "Estamos sincronizando la informacion mas reciente."
} = {}){
  let workers = [];

  for (let attempt = 0; attempt < attempts; attempt += 1){
    setGlobalLoader(true, {
      title: loaderTitle,
      text: loaderText
    });

    workers = await getWorkersData();
    renderWorkers(workers);

    if (!match || match(workers)){
      return workers;
    }

    await wait(delayMs);
  }

  return workers;
}

function fillWorkerSelects(workers){
  const selectedWorker = workerSelect.value;
  const selectedLiquidWorker = liquidWorker.value;

  workerSelect.innerHTML = "";
  liquidWorker.innerHTML = "";

  workers.forEach(worker => {
    const option = `<option value="${worker.id}">${worker.name}</option>`;
    workerSelect.innerHTML += option;
    liquidWorker.innerHTML += option;
  });

  if (selectedWorker && workers.some(worker => String(worker.id) === String(selectedWorker))){
    workerSelect.value = selectedWorker;
  }

  if (selectedLiquidWorker && workers.some(worker => String(worker.id) === String(selectedLiquidWorker))){
    liquidWorker.value = selectedLiquidWorker;
  }

  const availableIds = new Set(workers.map(worker => String(worker.id)));
  selectedBatchWorkers = new Set([...selectedBatchWorkers].filter(workerId => availableIds.has(workerId)));

  if (selectedBatchWorkers.size === 0 && workerSelect.value){
    selectedBatchWorkers.add(String(workerSelect.value));
  }

  renderMultiWorkerList(workers);
}

async function deleteWorker(id){
  const previousCount = currentWorkers.length;
  setGlobalLoader(true, {
    title: "Eliminando trabajador",
    text: "Estamos actualizando la lista para reflejar el cambio."
  });

  try {
    await api("deleteWorker", { id });
    removeOptimisticWorker(id);
    await loadWorkers();
    await syncWorkersUI({
      loaderTitle: "Actualizando trabajadores",
      loaderText: "Estamos sincronizando la lista despues de la eliminacion.",
      attempts: 10,
      delayMs: 500,
      match: workers => workers.length < previousCount
    });
    await loadDashboard();
  } finally {
    setGlobalLoader(false);
  }
}

async function editWorker(id, currentName, currentPhone, currentEmail){
  const safeName = escapeHTML(currentName || "");
  const safePhone = escapeHTML(currentPhone || "");
  const safeEmail = escapeHTML(currentEmail || "");

  const { isConfirmed, value } = await showPremiumModal({
    title: "Editar trabajador",
    html: `
      <div class="apple-modal-form">
        <label class="apple-modal-field">
          <span>Nombre</span>
          <input id="swalWorkerName" class="apple-modal-input-field" value="${safeName}" placeholder="Nombre">
        </label>
        <label class="apple-modal-field">
          <span>Telefono</span>
          <input id="swalWorkerPhone" class="apple-modal-input-field" value="${safePhone}" placeholder="Telefono">
        </label>
        <label class="apple-modal-field">
          <span>Email</span>
          <input id="swalWorkerEmail" class="apple-modal-input-field" value="${safeEmail}" placeholder="Correo">
        </label>
      </div>
    `,
    confirmButtonText: "Guardar cambios",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    focusConfirm: false,
    preConfirm: () => {
      const updatedName = document.getElementById("swalWorkerName").value.trim();
      const updatedPhone = document.getElementById("swalWorkerPhone").value.trim();
      const updatedEmail = document.getElementById("swalWorkerEmail").value.trim();

      if (!updatedName){
        Swal.showValidationMessage("El nombre es obligatorio.");
        return false;
      }

      return {
        name: updatedName,
        phone: updatedPhone,
        email: updatedEmail
      };
    }
  });

  if (!isConfirmed || !value){
    return;
  }

  await api("updateWorker", {
    id,
    name: value.name,
    phone: value.phone,
    email: value.email
  });

  loadWorkers();

  showPremiumModal({
    icon: "success",
    title: "Cambios guardados",
    text: `${value.name} fue actualizado correctamente.`
  });
}

function getSelectedAttendanceWorkerIds(){
  if (attendanceMode === "multi"){
    const availableIds = new Set(currentWorkers.map(worker => String(worker.id)));
    return [...selectedBatchWorkers].filter(workerId => availableIds.has(workerId));
  }

  const selectedWorkerId = String(workerSelect.value || "").trim();
  return selectedWorkerId ? [selectedWorkerId] : [];
}

function formatAttendanceTime(rawTime){
  if (!rawTime){
    return "ahora";
  }

  const parsedTime = new Date(rawTime);
  if (Number.isNaN(parsedTime.getTime())){
    return "ahora";
  }

  return parsedTime.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildBatchAttendanceRows(results, maxRows = 8){
  const visibleRows = results.slice(0, maxRows);
  const remainingCount = Math.max(results.length - maxRows, 0);

  const rows = visibleRows.map(result => `
    <div class="apple-liquidation-row">
      <span>${escapeHTML(result.name || getWorkerNameById(result.workerId))}</span>
      <strong>${formatAttendanceTime(result.time)}</strong>
    </div>
  `).join("");

  if (!remainingCount){
    return rows;
  }

  return `${rows}
    <div class="apple-liquidation-row">
      <span>Registros adicionales</span>
      <strong>+${remainingCount}</strong>
    </div>`;
}

async function registerAttendance(action){
  const isCheckIn = action === "checkIn";
  const selectedWorkerIds = getSelectedAttendanceWorkerIds();

  if (!selectedWorkerIds.length){
    showPremiumModal({
      icon: "warning",
      title: "Seleccion requerida",
      text: attendanceMode === "multi"
        ? "Selecciona uno o mas trabajadores en el modo multiple."
        : "Selecciona un trabajador para registrar el marcaje."
    });
    return;
  }

  setGlobalLoader(true, {
    title: isCheckIn ? "Registrando entradas" : "Registrando salidas",
    text: isCheckIn
      ? "Estamos marcando la entrada de los trabajadores seleccionados."
      : "Estamos marcando la salida de los trabajadores seleccionados."
  });

  let settledResults = [];
  try {
    settledResults = await Promise.allSettled(
      selectedWorkerIds.map(workerId => api(action, { worker: workerId }))
    );
  } finally {
    setGlobalLoader(false);
  }

  const successResults = [];
  const failedResults = [];

  settledResults.forEach((result, index) => {
    const workerId = selectedWorkerIds[index];
    const fallbackName = getWorkerNameById(workerId);

    if (result.status !== "fulfilled"){
      failedResults.push({ workerId, name: fallbackName });
      return;
    }

    const payload = result.value || {};
    if (payload.error){
      failedResults.push({ workerId, name: payload.name || fallbackName });
      return;
    }

    successResults.push({
      workerId,
      name: payload.name || fallbackName,
      time: payload.time,
      earned: Number(payload.earned || 0)
    });
  });

  if (!successResults.length){
    showPremiumModal({
      icon: "error",
      title: "No fue posible registrar",
      text: "No se pudo completar el marcaje. Intenta de nuevo."
    });
    return;
  }

  if (successResults.length === 1 && failedResults.length === 0){
    const result = successResults[0];
    showPremiumModal({
      icon: "success",
      title: result.name,
      text: isCheckIn
        ? `Entrada registrada ${formatAttendanceTime(result.time)}`
        : `Salida registrada ${formatAttendanceTime(result.time)} - Ganado ${formatCOP(result.earned)}`
    });
  } else {
    const totalEarned = successResults.reduce((sum, result) => sum + Number(result.earned || 0), 0);

    showPremiumModal({
      icon: failedResults.length ? "warning" : "success",
      title: isCheckIn ? "Entradas registradas" : "Salidas registradas",
      html: `
        <div class="apple-liquidation-summary">
          <div class="apple-liquidation-row"><span>Registros exitosos</span><strong>${successResults.length}</strong></div>
          ${isCheckIn ? "" : `<div class="apple-liquidation-row"><span>Total ganado</span><strong>${formatCOP(totalEarned)}</strong></div>`}
          ${failedResults.length ? `<div class="apple-liquidation-row"><span>Sin registrar</span><strong>${failedResults.length}</strong></div>` : ""}
          ${buildBatchAttendanceRows(successResults)}
        </div>
      `
    });
  }

  const selectedViewerWorker = String(workerSelect.value || "");
  const shouldRefreshLogs = successResults.some(result => String(result.workerId) === selectedViewerWorker);
  void Promise.allSettled([
    refreshLive(),
    shouldRefreshLogs ? loadTimeLogs({ showLoader: false }) : Promise.resolve()
  ]);
}

async function checkIn(){
  await registerAttendance("checkIn");
}

async function checkOut(){
  await registerAttendance("checkOut");
}

async function refreshLive(){
  await loadWorkers();
  if (adminUnlocked){
    await loadDashboard();
  }
}

async function saveRate(){
  const rateInput = document.getElementById("hourRate");
  const nextRate = Number(rateInput.value);

  if (!Number.isFinite(nextRate) || nextRate <= 0){
    showPremiumModal({
      icon: "warning",
      title: "Valor invalido",
      text: "Ingresa una tarifa por hora valida antes de guardar."
    });
    return;
  }

  if (currentHourRate !== null && Number(currentHourRate) === nextRate){
    return;
  }

  setGlobalLoader(true, {
    title: "Guardando valor por hora",
    text: "Estamos actualizando la tarifa actual del sistema."
  });

  try {
    await api("setRate", { value: nextRate });
    await loadDashboard();
    await loadCurrentRate();
    if (currentHourRate === null){
      setCurrentRate(nextRate);
    }
    clearRateInput();
    renderCurrentRate(currentHourRate ?? nextRate);

    showPremiumModal({
      icon: "success",
      title: "Tarifa actualizada",
      text: `La hora quedo guardada en ${formatCOP(currentHourRate ?? nextRate)}`
    });
  } finally {
    setGlobalLoader(false);
  }
}

async function loadDashboard(){
  const dashboard = await api("getDashboard");

  kpiWorkers.textContent = dashboard.workers;
  kpiHours.textContent = dashboard.hours;
  kpiPay.textContent = formatCOP(dashboard.pay || 0);
  kpiMonth.textContent = dashboard.month || dashboard.liquidations || "Al dia";

  const backendRate = getRateFromDashboard(dashboard);
  if (backendRate !== null){
    setCurrentRate(backendRate);
  } else if (currentHourRate !== null){
    renderCurrentRate(currentHourRate);
  }
}

async function loadCurrentRate(){
  try {
    const settingsResponse = await api("getSettings");
    const backendRate = extractRateFromSettings(settingsResponse);

    if (backendRate !== null){
      setCurrentRate(backendRate);
      return backendRate;
    }
  } catch (error){
    // Fallback silencioso a dashboard si la accion no existe o falla.
  }

  try {
    const dashboard = await api("getDashboard");
    const backendRate = getRateFromDashboard(dashboard);

    if (backendRate !== null){
      setCurrentRate(backendRate);
      return backendRate;
    }
  } catch (error){
    // Si tambien falla, dejamos el estado actual.
  }

  return null;
}

async function liquidate(workerId){
  const targetWorker = workerId || liquidWorker.value;
  const targetWorkerData = currentWorkers.find(worker => String(worker.id) === String(targetWorker));

  setGlobalLoader(true, {
    title: "Liquidando trabajador",
    text: "Estamos calculando las horas y el valor total pendiente."
  });

  try {
    const result = await api("liquidateWorker", { worker: targetWorker });
    setGlobalLoader(false);

    const liquidatedAmount = formatCOP(result.amount);
    const liquidatedHours = formatHoursValue(result.hours);
    const workerName = escapeHTML(result.name || targetWorkerData?.name || "Trabajador");

    await showPremiumModal({
      icon: "success",
      title: "Liquidacion completada",
      html: `
        <div class="apple-liquidation-summary">
          <div class="apple-liquidation-row"><span>Trabajador</span><strong>${workerName}</strong></div>
          <div class="apple-liquidation-row"><span>Horas liquidadas</span><strong>${liquidatedHours} h</strong></div>
          <div class="apple-liquidation-row"><span>Total liquidado</span><strong>${liquidatedAmount}</strong></div>
        </div>
      `
    });
    void Promise.allSettled([loadDashboard(), loadWorkers()]);
  } catch (error){
    setGlobalLoader(false);
    await showPremiumModal({
      icon: "error",
      title: "No se pudo liquidar",
      text: "Intenta nuevamente en unos segundos."
    });
  }
}

function setTimeLoader(isVisible){
  timeLoader.classList.toggle("visible", isVisible);
  timeLoader.setAttribute("aria-hidden", String(!isVisible));
}

function setGlobalLoader(isVisible, {
  title = "Procesando cambios",
  text = "Espera un momento mientras actualizamos la informacion."
} = {}){
  globalLoaderTitle.textContent = title;
  globalLoaderText.textContent = text;
  globalLoader.classList.toggle("visible", isVisible);
  globalLoader.setAttribute("aria-hidden", String(!isVisible));
}

function setCurrentRate(value){
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0){
    return;
  }

  currentHourRate = numericValue;
  renderCurrentRate(currentHourRate);
}

function normalizeWorker(worker = {}){
  return {
    id: worker.id || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: worker.name || "Sin nombre",
    phone: worker.phone || "",
    email: worker.email || "",
    hours: Number(worker.hours || 0),
    pay: Number(worker.pay || 0),
    days: Number(worker.days || 0),
    active: Boolean(worker.active),
    activeStart: worker.activeStart || "",
    lastLiquidation: worker.lastLiquidation || ""
  };
}

function getRateFromDashboard(dashboard){
  if (!dashboard || typeof dashboard !== "object"){
    return null;
  }

  const directCandidates = [
    dashboard.rate,
    dashboard.hourRate,
    dashboard.hourlyRate,
    dashboard.valorHora,
    dashboard.valorhora,
    dashboard.rateValue,
    dashboard.currentRate,
    dashboard.tarifaHora,
    dashboard.tarifa
  ];

  for (const candidate of directCandidates){
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue > 0){
      return numericValue;
    }
  }

  for (const [key, value] of Object.entries(dashboard)){
    if (!/rate|hora|tarifa/i.test(key)){
      continue;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0){
      return numericValue;
    }
  }

  return null;
}

function extractRateFromSettings(settingsResponse){
  if (!settingsResponse){
    return null;
  }

  if (Array.isArray(settingsResponse)){
    for (const row of settingsResponse){
      const numericValue = extractNumericSettingValue(row);
      if (numericValue !== null){
        return numericValue;
      }
    }
    return null;
  }

  return extractNumericSettingValue(settingsResponse);
}

function extractNumericSettingValue(row){
  if (row === null || row === undefined){
    return null;
  }

  if (typeof row === "number"){
    return Number.isFinite(row) && row > 0 ? row : null;
  }

  if (typeof row === "string"){
    const numericValue = Number(row);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  if (typeof row !== "object"){
    return null;
  }

  const sheetName = String(row.sheet || row.sheetName || row.name || row.key || "").toLowerCase();
  const valueCandidates = [
    row.value,
    row.Value,
    row.valor,
    row.rate,
    row.hourRate
  ];

  if (!sheetName || /settings/.test(sheetName)){
    for (const candidate of valueCandidates){
      const numericValue = Number(candidate);
      if (Number.isFinite(numericValue) && numericValue > 0){
        return numericValue;
      }
    }
  }

  return null;
}

function insertOptimisticWorker(result, payload){
  const workerFromApi = result && typeof result === "object"
    ? {
        ...result,
        name: result.name || payload.name,
        phone: result.phone || payload.phone,
        email: result.email || payload.email
      }
    : payload;

  const optimisticWorker = normalizeWorker(workerFromApi);
  const exists = currentWorkers.some(worker =>
    String(worker.id) === String(optimisticWorker.id) ||
    (
      (worker.name || "").trim().toLowerCase() === optimisticWorker.name.trim().toLowerCase() &&
      (worker.phone || "").trim() === optimisticWorker.phone.trim() &&
      (worker.email || "").trim().toLowerCase() === optimisticWorker.email.trim().toLowerCase()
    )
  );

  if (!exists){
    currentWorkers = [optimisticWorker, ...currentWorkers.map(normalizeWorker)];
    renderWorkers(currentWorkers);
  }
}

function removeOptimisticWorker(id){
  currentWorkers = currentWorkers
    .filter(worker => String(worker.id) !== String(id))
    .map(normalizeWorker);
  renderWorkers(currentWorkers);
}

function updateTimeCaption(text){
  timeTableCaption.textContent = text;
}

workerSelect.addEventListener("change", () => {
  if (attendanceMode === "multi" && selectedBatchWorkers.size === 0 && workerSelect.value){
    selectedBatchWorkers.add(String(workerSelect.value));
    renderMultiWorkerList(currentWorkers);
  }

  loadTimeLogs({ showLoader: true });
});

setInterval(() => {
  document.querySelectorAll(".liveTimer").forEach(el => {
    const start = new Date(el.dataset.start);
    const mins = Math.floor((Date.now() - start) / 60000);
    el.textContent = "Tiempo en turno: " + formatMinutes(mins);
  });
}, 1000);

async function loadTimeLogs({ showLoader = true } = {}){
  const workerId = workerSelect.value;
  const workerName = workerSelect.options[workerSelect.selectedIndex]?.text || "este trabajador";

  if (!workerId){
    timeLogsTable.innerHTML = `<tr><td colspan="4" class="time-empty">Selecciona un trabajador para ver los marcajes.</td></tr>`;
    updateTimeCaption("Selecciona un trabajador para ver sus registros.");
    setTimeLoader(false);
    return;
  }

  if (showLoader){
    setTimeLoader(true);
  }

  updateTimeCaption(`Mostrando los registros mas recientes de ${workerName}.`);

  try {
    const logs = await api("getTimeLogsByWorker", { worker: workerId });

    if (!logs.length){
      timeLogsTable.innerHTML = `<tr><td colspan="4" class="time-empty">${workerName} aun no tiene marcajes registrados.</td></tr>`;
      return;
    }

    timeLogsTable.innerHTML = logs.map(log => {
      const inDate = new Date(log.start);
      const outDate = log.end ? new Date(log.end) : null;

      const inFormatted = inDate.toLocaleString("es-CO", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });

      const outFormatted = outDate
        ? outDate.toLocaleString("es-CO", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "Pendiente";

      const status = outDate
        ? `<div class="status-ok">OK</div>`
        : `<span class="active-dot">EN TURNO</span>`;

      return `
        <tr>
          <td>${log.workerName}</td>
          <td>${inFormatted}</td>
          <td>${outFormatted}</td>
          <td>${status}</td>
        </tr>
      `;
    }).join("");
  } catch (error){
    timeLogsTable.innerHTML = `<tr><td colspan="4" class="time-empty">No fue posible cargar los marcajes en este momento.</td></tr>`;
    updateTimeCaption(`Hubo un problema cargando los registros de ${workerName}.`);
  } finally {
    setTimeLoader(false);
  }
}

setAttendanceMode("single");
showSection("time");

setInterval(() => {
  if (adminUnlocked){
    loadDashboard();
  }
}, 5000);
