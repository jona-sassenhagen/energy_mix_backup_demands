(function () {
  const capacities = {
    "Wind offshore": 0.11666666666666667,
    "Wind onshore": 0.24166666666666667,
    Solar: 0.6416666666666667,
    Nuclear: 0.0
  };

  const colors = {
    Nuclear: "#9B59B6",
    "Wind offshore": "#4A90E2",
    "Wind onshore": "#7CB9E8",
    Solar: "#FDB813",
    "Storage potential": "#2ECC71",
    "Storage consumption requirement": "#E74C3C",
    Load: "#000000"
  };

  const HIGHLIGHT_COLOR = "#c0392b";

  const MS_IN_DAY = 24 * 60 * 60 * 1000;

  const startInput = document.getElementById("start-date");
  const durationSlider = document.getElementById("duration-slider");
  const durationValueEl = document.getElementById("duration-value");
  const slider1 = document.getElementById("nuclear-slider-1");
  const slider2 = document.getElementById("nuclear-slider-2");
  const sliderValue1 = document.getElementById("nuclear-value-1");
  const sliderValue2 = document.getElementById("nuclear-value-2");
  const warningEl = document.getElementById("date-range-warning");
  const dateInfoEl = document.getElementById("date-info");
  const backup1El = document.getElementById("backup-capacity-1");
  const backup2El = document.getElementById("backup-capacity-2");
  const storage1El = document.getElementById("storage-requirement-1");
  const storage2El = document.getElementById("storage-requirement-2");

  let dataset = [];
  let minTimestamp = null;
  let maxTimestamp = null;

  function formatDateInput(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(date) {
    return date.toISOString().split("T")[0];
  }

  function parseDateInput(value) {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDuration(days) {
    if (!Number.isFinite(days)) return "";
    if (days === 1) return "1 day";
    if (days % 30 === 0) {
      const months = days / 30;
      return months === 1 ? "1 month (30 days)" : `${months} months (${days} days)`;
    }
    if (days % 7 === 0) {
      const weeks = days / 7;
      return weeks === 1 ? "1 week (7 days)" : `${weeks} weeks (${days} days)`;
    }
    return `${days} days`;
  }

  function updateSliderLabels() {
    sliderValue1.textContent = `${slider1.value}%`;
    sliderValue2.textContent = `${slider2.value}%`;
    if (durationValueEl && durationSlider) {
      durationValueEl.textContent = formatDuration(Number(durationSlider.value));
    }
  }

  function formatBackup(value) {
    if (!Number.isFinite(value)) {
      return '⚡ Minimum Backup Peaker Plant/Storage requirement: <span class="metric-number">N/A</span>';
    }
    const formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    return `⚡ Minimum Backup Peaker Plant/Storage requirement: <span class="metric-number">${formatted}</span> GW`;
  }

  function formatStorageRequirement(value) {
    if (!Number.isFinite(value)) {
      return '🔋 Minimum Storage requirement to avoid curtailments: <span class="metric-number">N/A</span>';
    }
    const formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    return `🔋 Minimum Storage requirement to avoid curtailments: <span class="metric-number">${formatted}</span> GW`;
  }

  function applyHighlight(element1, element2, value1, value2, highlightColor) {
    const number1 = element1.querySelector(".metric-number");
    const number2 = element2.querySelector(".metric-number");

    if (number1) number1.style.color = "";
    if (number2) number2.style.color = "";

    const v1 = Number.isFinite(value1) ? value1 : -Infinity;
    const v2 = Number.isFinite(value2) ? value2 : -Infinity;

    if (v1 === -Infinity && v2 === -Infinity) {
      return;
    }

    const nearlyEqual = Math.abs(v1 - v2) < 1e-9;

    if (nearlyEqual) {
      if (Number.isFinite(value1) && number1) {
        number1.style.color = highlightColor;
      }
      if (Number.isFinite(value2) && number2) {
        number2.style.color = highlightColor;
      }
      return;
    }

    if (v1 > v2) {
      if (number1) number1.style.color = highlightColor;
    } else {
      if (number2) number2.style.color = highlightColor;
    }
  }

  function clearVisuals(message) {
    Plotly.purge("energy-mix-graph");
    Plotly.purge("donut-1");
    Plotly.purge("donut-2");
    const backupMessage = message || "";
    const storageMessage = message ? message.replace("⚡", "🔋") : "";
    backup1El.textContent = backupMessage;
    backup2El.textContent = backupMessage;
    storage1El.textContent = storageMessage;
    storage2El.textContent = storageMessage;
  }

  function loadData() {
    if (window.location.protocol === "file:") {
      warningEl.textContent =
        "⚠️ Browsers block CSV requests from file://. Run a local server (e.g. `python -m http.server`) or deploy to GitHub Pages.";
      clearVisuals("⚡ N/A");
      return;
    }

    fetch("df_cf.csv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((csvText) => {
        if (!window.d3 || typeof window.d3.csvParse !== "function") {
          throw new Error("d3.csvParse unavailable – check d3-dsv script load order.");
        }

        const rows = window.d3.csvParse(csvText);
        dataset = rows
          .map((row) => {
            const keys = Object.keys(row);
            const timeKey = keys[0];
            const timeString = row[timeKey];
            const timestamp = new Date(timeString);
            return {
              timestamp,
              iso: timeString,
              Solar: Number(row.Solar),
              "Wind onshore": Number(row["Wind onshore"]),
              "Wind offshore": Number(row["Wind offshore"]),
              Load: Number(row.Load),
              Nuclear: Number(row.Nuclear)
            };
          })
          .filter((entry) => !Number.isNaN(entry.timestamp.getTime()));

        if (!dataset.length) {
          warningEl.textContent = "⚠️ Unable to load scenario data.";
          clearVisuals("⚡ N/A");
          return;
        }

        dataset.sort((a, b) => a.timestamp - b.timestamp);
        minTimestamp = dataset[0].timestamp;
        maxTimestamp = dataset[dataset.length - 1].timestamp;

        startInput.min = formatDateInput(minTimestamp);
        startInput.max = formatDateInput(maxTimestamp);
        if (!startInput.value) {
          startInput.value = formatDateInput(minTimestamp);
        }

        updateSliderLabels();
        updateVisuals();
      })
      .catch((error) => {
        console.error("Failed to load df_cf.csv", error);
        warningEl.textContent = "⚠️ Failed to load df_cf.csv. Verify the file is available.";
        clearVisuals("⚡ N/A");
      });
  }

  function computeScenario(period, nuclearFraction) {
    const solarSum = period.reduce((acc, row) => acc + row.Solar, 0);
    const windOnshoreSum = period.reduce((acc, row) => acc + row["Wind onshore"], 0);
    const windOffshoreSum = period.reduce((acc, row) => acc + row["Wind offshore"], 0);
    const loadSum = period.reduce((acc, row) => acc + row.Load, 0);
    const nuclearCfSum = period.reduce((acc, row) => acc + row.Nuclear, 0);

    const nuclearGenerationNeeded = nuclearFraction * loadSum;
    const nuclearInstalled = nuclearCfSum > 0 ? nuclearGenerationNeeded / nuclearCfSum : 0;

    const renewableGenerationNeeded = (1 - nuclearFraction) * loadSum;
    const renewableCfWeighted =
      capacities.Solar * solarSum +
      capacities["Wind onshore"] * windOnshoreSum +
      capacities["Wind offshore"] * windOffshoreSum;

    const totalRenewableInstalled =
      renewableCfWeighted > 0 ? renewableGenerationNeeded / renewableCfWeighted : 0;

    const installedCapacity = {
      Nuclear: nuclearInstalled,
      "Wind offshore": capacities["Wind offshore"] * totalRenewableInstalled,
      "Wind onshore": capacities["Wind onshore"] * totalRenewableInstalled,
      Solar: capacities.Solar * totalRenewableInstalled
    };

    const timestamps = [];
    const loadSeries = [];
    const series = {
      Nuclear: [],
      "Wind offshore": [],
      "Wind onshore": [],
      Solar: [],
      "Storage potential": [],
      "Storage consumption requirement": []
    };

    let peakSurplus = 0;
    let peakDeficit = 0;

    period.forEach((row) => {
      const nuclearGen = row.Nuclear * installedCapacity.Nuclear;
      const windOffshoreGen = row["Wind offshore"] * installedCapacity["Wind offshore"];
      const windOnshoreGen = row["Wind onshore"] * installedCapacity["Wind onshore"];
      const solarGen = row.Solar * installedCapacity.Solar;
      const totalGen = nuclearGen + windOffshoreGen + windOnshoreGen + solarGen;

      const loadValue = row.Load;
      const bess = totalGen - loadValue;
      const storagePotential = -(bess > 0 ? bess : 0);
      const storageConsumption = -(bess < 0 ? bess : 0);

      peakSurplus = Math.max(peakSurplus, bess > 0 ? bess : 0);
      peakDeficit = Math.max(peakDeficit, bess < 0 ? -bess : 0);

      timestamps.push(row.iso);
      loadSeries.push(loadValue);
      series.Nuclear.push(nuclearGen);
      series["Wind offshore"].push(windOffshoreGen);
      series["Wind onshore"].push(windOnshoreGen);
      series.Solar.push(solarGen);
      series["Storage potential"].push(storagePotential);
      series["Storage consumption requirement"].push(storageConsumption);
    });

    const batteryCapacity = peakDeficit;

    return {
      nuclearFraction,
      timestamps,
      loadSeries,
      series,
      installedCapacity,
      batteryCapacity,
      storageRequirement: peakSurplus
    };
  }

  function axisSuffix(index) {
    return index === 0 ? "" : String(index + 1);
  }

  function axisName(base, suffix) {
    return suffix === "" ? base : `${base}${suffix}`;
  }

  function renderPlots(scenarios, startLabel, endLabel) {
    if (!scenarios.length) {
      clearVisuals("⚡ N/A");
      return;
    }

    const traces = [];
    const shapes = [];
    const annotations = [];
    const maxPositives = [];
    const minNegatives = [];
    const positiveKeys = ["Nuclear", "Wind offshore", "Wind onshore", "Solar", "Storage potential"];

    scenarios.forEach((scenario, index) => {
      const suffix = axisSuffix(index);
      const xAxisRef = axisName("x", suffix);
      const yAxisRef = axisName("y", suffix);

      positiveKeys.forEach((key) => {
        traces.push({
          type: "bar",
          name: key,
          x: scenario.timestamps,
          y: scenario.series[key],
          marker: { color: colors[key] },
          legendgroup: key,
          showlegend: index === 0,
          xaxis: xAxisRef,
          yaxis: yAxisRef,
          hovertemplate: `<b>${key}</b><br>Time: %{x}<br>Power: %{y:.2f} GW<extra></extra>`
        });
      });

      traces.push({
        type: "bar",
        name: "Storage consumption requirement",
        x: scenario.timestamps,
        y: scenario.series["Storage consumption requirement"],
        marker: { color: colors["Storage consumption requirement"] },
        legendgroup: "Storage consumption requirement",
        showlegend: index === 0,
        xaxis: xAxisRef,
        yaxis: yAxisRef,
        hovertemplate:
          "<b>Storage consumption requirement</b><br>Time: %{x}<br>Power: %{y:.2f} GW<extra></extra>"
      });

      traces.push({
        type: "scatter",
        mode: "lines",
        name: "Load",
        x: scenario.timestamps,
        y: scenario.loadSeries,
        line: { color: colors.Load, width: 2 },
        legendgroup: "Load",
        showlegend: index === 0,
        xaxis: xAxisRef,
        yaxis: yAxisRef,
        hovertemplate: "<b>Load</b><br>Time: %{x}<br>Power: %{y:.2f} GW<extra></extra>"
      });

      const totalGeneration = scenario.series.Nuclear.map((_, i) =>
        scenario.series.Nuclear[i] +
        scenario.series["Wind offshore"][i] +
        scenario.series["Wind onshore"][i] +
        scenario.series.Solar[i]
      );

      maxPositives.push(Math.max(0, ...totalGeneration));
      minNegatives.push(
        Math.min(
          ...scenario.series["Storage potential"],
          ...scenario.series["Storage consumption requirement"]
        )
      );

      if (scenario.timestamps.length) {
        shapes.push({
          type: "line",
          xref: xAxisRef,
          yref: yAxisRef,
          x0: scenario.timestamps[0],
          x1: scenario.timestamps[scenario.timestamps.length - 1],
          y0: 0,
          y1: 0,
          line: { color: "#888", width: 1, dash: "dash" }
        });
      }

      const annotationY = 1 - index / scenarios.length + 0.04 - index * 0.08;
      annotations.push({
        text: `Nuclear share: ${Math.round(scenario.nuclearFraction * 100)}%`,
        xref: "paper",
        yref: "paper",
        x: 0.02,
        y: Math.min(annotationY, 0.98),
        showarrow: false,
        align: "left",
        font: { size: 14, color: "#1f3a59" }
      });
    });

    const overallMax = Math.max(...maxPositives);
    const overallMin = Math.min(...minNegatives);
    let yRange = overallMax - overallMin;
    if (!Number.isFinite(yRange) || yRange === 0) {
      yRange = Math.max(1, overallMax || 1);
    }
    const padding = yRange * 0.1;
    const finalMin = Number.isFinite(overallMin) ? overallMin - padding : -padding;
    const finalMax = Number.isFinite(overallMax) ? overallMax + padding : padding;

    const layout = {
      title: {
        text: `Energy Mix Analysis: ${startLabel} to ${endLabel}`,
        font: { size: 20 }
      },
      barmode: "relative",
      hovermode: "x unified",
      height: 400 * scenarios.length,
      legend: {
        orientation: "h",
        yanchor: "top",
        y: -0.2,
        xanchor: "center",
        x: 0.5
      },
      margin: { l: 60, r: 40, t: 80, b: 160 },
      grid: { rows: scenarios.length, columns: 1, pattern: "independent", roworder: "top to bottom" },
      shapes,
      annotations
    };

    scenarios.forEach((scenario, index) => {
      const suffix = axisSuffix(index);
      const xAxisName = axisName("xaxis", suffix);
      const yAxisName = axisName("yaxis", suffix);

      layout[xAxisName] = {
        title: index === scenarios.length - 1 ? "Time" : "",
        type: "date",
        automargin: true
      };

      layout[yAxisName] = {
        title: index === 0 ? "Power (GW)" : "",
        range: [finalMin, finalMax],
        automargin: true
      };
    });

    Plotly.react("energy-mix-graph", traces, layout, { responsive: true });
  }

  function renderDonut(elementId, installedCapacity) {
    const labels = Object.keys(installedCapacity);
    const values = labels.map((label) => installedCapacity[label] || 0);
    const total = values.reduce((acc, value) => acc + value, 0);

    Plotly.react(
      elementId,
      [
        {
          type: "pie",
          hole: 0.5,
          labels,
          values,
          marker: { colors: labels.map((label) => colors[label] || "#999999") },
          textinfo: "label+percent",
          hovertemplate: "<b>%{label}</b><br>Capacity: %{value:.0f} GW<br>%{percent}<extra></extra>",
          sort: false
        }
      ],
      {
        showlegend: false,
        height: 220,
        width: 220,
        margin: { l: 10, r: 10, t: 30, b: 10 },
        annotations: [
          {
            text: `${Math.round(total).toLocaleString()} GW`,
            x: 0.5,
            y: 0.5,
            font: { size: 14, color: "#1f3a59" },
            showarrow: false
          }
        ]
      },
      { displayModeBar: false, responsive: true }
    );
  }

  function updateVisuals() {
    if (!dataset.length || !minTimestamp || !maxTimestamp) {
      clearVisuals("⚡ N/A");
      return;
    }

    let start = parseDateInput(startInput.value);
    const durationDays = Number(durationSlider.value) || 1;
    const warningMessages = [];

    if (!start) {
      warningEl.textContent = "⚠️ Please select a valid start date.";
      clearVisuals("⚡ N/A");
      return;
    }

    if (start < minTimestamp) {
      start = new Date(minTimestamp.getTime());
      startInput.value = formatDateInput(start);
      warningMessages.push(`⚠️ Start date adjusted to minimum: ${formatDisplayDate(start)}`);
    }

    if (start > maxTimestamp) {
      start = new Date(maxTimestamp.getTime());
      startInput.value = formatDateInput(start);
      warningMessages.push(`⚠️ Start date adjusted to maximum: ${formatDisplayDate(start)}`);
    }

    let end = new Date(start.getTime() + durationDays * MS_IN_DAY);
    if (end > maxTimestamp) {
      end = new Date(maxTimestamp.getTime());
      const actualDays = Math.max(0, Math.round((end - start) / MS_IN_DAY));
      warningMessages.push(`⚠️ Window extends beyond available data. Limited to ${actualDays} days.`);
    }

    const startLabel = formatDisplayDate(start);
    const endLabel = formatDisplayDate(end);
    const period = dataset.filter((row) => row.timestamp >= start && row.timestamp <= end);

    if (!period.length) {
      dateInfoEl.textContent = `📅 Analyzing: ${startLabel} to ${endLabel} (0 days)`;
      warningEl.textContent = warningMessages.join(" ");
      clearVisuals("⚡ N/A");
      return;
    }

    const actualDuration = Math.max(1, Math.round((end - start) / MS_IN_DAY));
    dateInfoEl.textContent = `📅 Analyzing: ${startLabel} to ${endLabel} (${actualDuration} days)`;
    warningEl.textContent = warningMessages.join(" ");

    const scenarios = [
      computeScenario(period, Number(slider1.value) / 100),
      computeScenario(period, Number(slider2.value) / 100)
    ];

    backup1El.innerHTML = formatBackup(scenarios[0].batteryCapacity);
    backup2El.innerHTML = formatBackup(scenarios[1].batteryCapacity);
    storage1El.innerHTML = formatStorageRequirement(scenarios[0].storageRequirement);
    storage2El.innerHTML = formatStorageRequirement(scenarios[1].storageRequirement);

    applyHighlight(
      backup1El,
      backup2El,
      scenarios[0].batteryCapacity,
      scenarios[1].batteryCapacity,
      HIGHLIGHT_COLOR
    );
    applyHighlight(
      storage1El,
      storage2El,
      scenarios[0].storageRequirement,
      scenarios[1].storageRequirement,
      HIGHLIGHT_COLOR
    );

    renderPlots(scenarios, startLabel, endLabel);
    renderDonut("donut-1", scenarios[0].installedCapacity);
    renderDonut("donut-2", scenarios[1].installedCapacity);
  }

  startInput.addEventListener("change", updateVisuals);
  durationSlider.addEventListener("input", () => {
    updateSliderLabels();
    updateVisuals();
  });
  slider1.addEventListener("input", () => {
    updateSliderLabels();
    updateVisuals();
  });
  slider2.addEventListener("input", () => {
    updateSliderLabels();
    updateVisuals();
  });

  document.addEventListener("DOMContentLoaded", loadData);
})();
