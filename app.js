const state = {
  pyodide: null,
  salaryData: null,
  estimatorLoaded: false,
};

const el = {
  loadingState: document.getElementById("loadingState"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  form: document.getElementById("predictForm"),
  estimateBtn: document.getElementById("estimateBtn"),
  majorGroup: document.getElementById("majorGroup"),
  region: document.getElementById("region"),
  schoolTier: document.getElementById("schoolTier"),
  internships: document.getElementById("internships"),
  skillsWrap: document.getElementById("skillsWrap"),
  results: document.getElementById("results"),
  startingLow: document.getElementById("startingLow"),
  startingMid: document.getElementById("startingMid"),
  startingHigh: document.getElementById("startingHigh"),
  year5Mid: document.getElementById("year5Mid"),
  year5Range: document.getElementById("year5Range"),
  year10Mid: document.getElementById("year10Mid"),
  year10Range: document.getElementById("year10Range"),
  confidenceScore: document.getElementById("confidenceScore"),
  confidenceReasons: document.getElementById("confidenceReasons"),
  drivers: document.getElementById("drivers"),
  tips: document.getElementById("tips"),
  copyResultBtn: document.getElementById("copyResultBtn"),
};

let lastResult = null;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMoney(value) {
  return money.format(value || 0);
}

function showError(message) {
  el.loadingState.classList.add("hidden");
  el.form.classList.add("hidden");
  el.errorState.classList.remove("hidden");
  el.errorText.textContent = message;
}

function setLoading(loading) {
  el.estimateBtn.disabled = loading;
  el.estimateBtn.textContent = loading ? "Estimating..." : "Estimate";
}

function populateSelect(selectEl, values) {
  selectEl.innerHTML = "";
  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });
}

function populateSkills(skillsMap) {
  el.skillsWrap.innerHTML = "";
  Object.keys(skillsMap).forEach((skill) => {
    const label = document.createElement("label");
    label.className = "chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "skills";
    input.value = skill;

    const text = document.createElement("span");
    text.textContent = skill;

    label.appendChild(input);
    label.appendChild(text);
    el.skillsWrap.appendChild(label);
  });
}

function getCheckedSkills() {
  return Array.from(document.querySelectorAll('input[name="skills"]:checked')).map((node) => node.value);
}

function payloadFromForm() {
  const formData = new FormData(el.form);
  return {
    major_group: formData.get("major_group") || "",
    region: formData.get("region") || "",
    school_tier: formData.get("school_tier") || "",
    graduation_year: formData.get("graduation_year") || "",
    gpa: formData.get("gpa") || "",
    internships: formData.get("internships") || "0",
    work_experience_years: formData.get("work_experience_years") || "",
    high_cost_metro: formData.get("high_cost_metro") === "on",
    skills: getCheckedSkills(),
  };
}

function renderList(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderResult(result) {
  lastResult = result;

  el.startingLow.textContent = fmtMoney(result.starting.low);
  el.startingMid.textContent = fmtMoney(result.starting.mid);
  el.startingHigh.textContent = fmtMoney(result.starting.high);

  el.year5Mid.textContent = fmtMoney(result.year5.mid);
  el.year5Range.textContent = `${fmtMoney(result.year5.low)} - ${fmtMoney(result.year5.high)}`;

  el.year10Mid.textContent = fmtMoney(result.year10.mid);
  el.year10Range.textContent = `${fmtMoney(result.year10.low)} - ${fmtMoney(result.year10.high)}`;

  el.confidenceScore.textContent = `${result.confidence.score}/100`;
  renderList(el.confidenceReasons, result.confidence.reasons || []);
  renderList(el.drivers, result.drivers || []);
  renderList(el.tips, result.tips || []);

  el.results.classList.remove("hidden");
  el.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildCopyText(result) {
  if (!result) return "";

  const i = result.inputs_used || {};
  return [
    "Career Salary Predictor Result",
    `Major: ${i.major_group || "Unknown"}`,
    `Region: ${i.region || "Unknown"}`,
    `Starting (Low / Median / High): ${fmtMoney(result.starting.low)} / ${fmtMoney(result.starting.mid)} / ${fmtMoney(result.starting.high)}`,
    `5-Year Median: ${fmtMoney(result.year5.mid)} (${fmtMoney(result.year5.low)} - ${fmtMoney(result.year5.high)})`,
    `10-Year Median: ${fmtMoney(result.year10.mid)} (${fmtMoney(result.year10.low)} - ${fmtMoney(result.year10.high)})`,
    `Confidence: ${result.confidence.score}/100`,
    "Disclaimer: Not financial advice; estimates vary.",
  ].join("\n");
}

async function copyResults() {
  if (!lastResult) return;
  const text = buildCopyText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
    alert("Results copied.");
  } catch {
    alert("Could not copy to clipboard.");
  }
}

async function runEstimate(payload) {
  const pyPayload = state.pyodide.toPy(payload);
  const pyData = state.pyodide.toPy(state.salaryData);

  try {
    state.pyodide.globals.set("payload_js", pyPayload);
    state.pyodide.globals.set("salary_data_js", pyData);

    const outputJson = state.pyodide.runPython(`
import json
result = estimate_salary(payload_js, salary_data_js)
json.dumps(result)
`);

    return JSON.parse(outputJson);
  } finally {
    pyPayload.destroy();
    pyData.destroy();
    state.pyodide.globals.delete("payload_js");
    state.pyodide.globals.delete("salary_data_js");
  }
}

async function initPyodideAndModel() {
  try {
    state.salaryData = await fetch("./salary_data.json").then((r) => {
      if (!r.ok) throw new Error("Could not load salary_data.json");
      return r.json();
    });

    state.pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/",
    });

    const modelSource = await fetch("./salary_model.py").then((r) => {
      if (!r.ok) throw new Error("Could not load salary_model.py");
      return r.text();
    });

    state.pyodide.runPython(modelSource);

    populateSelect(el.majorGroup, Object.keys(state.salaryData.major_groups));
    populateSelect(el.region, state.salaryData.regions);
    populateSelect(el.schoolTier, Object.keys(state.salaryData.school_tier_multipliers));
    populateSkills(state.salaryData.skills);

    el.loadingState.classList.add("hidden");
    el.form.classList.remove("hidden");
    state.estimatorLoaded = true;
  } catch (err) {
    showError(err && err.message ? err.message : "Unknown initialization error.");
  }
}

el.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.estimatorLoaded) return;

  const payload = payloadFromForm();
  setLoading(true);

  try {
    const result = await runEstimate(payload);
    renderResult(result);
  } catch (err) {
    alert(err && err.message ? err.message : "Could not compute estimate.");
  } finally {
    setLoading(false);
  }
});

el.copyResultBtn.addEventListener("click", copyResults);

initPyodideAndModel();
