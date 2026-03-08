document.addEventListener("DOMContentLoaded", () => {
  const ca09 = document.getElementById("district-ca-09");
  const mapWrapper = document.getElementById("map-wrapper");
  const dotLayer = document.getElementById("dot-layer");
  const infoBox = document.getElementById("info-box");
  const infoBoxContent = document.getElementById("info-box-content");
  const infoBoxInner = infoBox?.querySelector(".info-box-inner");
  const closeBtn = infoBox?.querySelector(".info-box-close");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  const pageLoader = document.getElementById("page-loader");
  const svg = document.getElementById("ca-map-svg");

  const micBtn = document.getElementById("mic-btn");
  const micBtnText = document.getElementById("mic-btn-text");
  const clearBtn = document.getElementById("clear-btn");
  const phoneInput = document.getElementById("phone-input");
  const transcriptInput = document.getElementById("transcript-input");
  const analyzeBtn = document.getElementById("analyze-btn");
  const sttStatus = document.getElementById("stt-status");

  const resultCard = document.getElementById("result-card");
  const resultStance = document.getElementById("result-stance");
  const resultIssue = document.getElementById("result-issue");
  const resultGeo = document.getElementById("result-geo");
  const resultSummary = document.getElementById("result-summary");

  const kpiTotal = document.getElementById("kpi-total");
  const kpiSupport = document.getElementById("kpi-support");
  const kpiAgainst = document.getElementById("kpi-against");

  const stanceChartCanvas = document.getElementById("stance-chart");
  const issuesChartCanvas = document.getElementById("issues-chart");
  const issueFilter = document.getElementById("issue-filter");

  if (
    !ca09 ||
    !mapWrapper ||
    !dotLayer ||
    !infoBox ||
    !infoBoxInner ||
    !closeBtn ||
    !zoomOutBtn ||
    !infoBoxContent ||
    !svg ||
    !micBtn ||
    !micBtnText ||
    !clearBtn ||
    !phoneInput ||
    !transcriptInput ||
    !analyzeBtn ||
    !sttStatus ||
    !resultCard ||
    !resultStance ||
    !resultIssue ||
    !resultGeo ||
    !resultSummary ||
    !kpiTotal ||
    !kpiSupport ||
    !kpiAgainst ||
    !stanceChartCanvas ||
    !issuesChartCanvas ||
    !issueFilter
  ) {
    return;
  }

  const defaultViewBox = "0 0 480 640";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const hashToSeed = (str) => {
    const s = String(str ?? "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const normalizePhone = (value) => String(value ?? "").replaceAll(/[^\d]/g, "");

  const deriveZipFromPhone = (phoneDigits) => {
    const d = normalizePhone(phoneDigits);
    const last5 = d.slice(-5);
    if (last5.length === 5) return last5;
    return "95202";
  };

  const nowIso = () => new Date().toISOString();

  const API_BASE = (() => {
    if (typeof window !== "undefined" && window.OPINION_API_BASE) return String(window.OPINION_API_BASE);
    return "";
  })();

  /** @type {{ id: string, createdAt: string, phone: string, zipcode: string, district: string, issue: string, stance: "support"|"against"|"neutral", summary: string, transcript: string, dot: { nx: number, ny: number, size: number } }[]} */
  const records = [];

  const setStatus = (text) => {
    sttStatus.textContent = text ?? "";
  };

  // Page load: hide loader after animation
  window.setTimeout(() => pageLoader?.classList.add("done"), 1600);

  const clearDots = () => {
    dotLayer.innerHTML = "";
  };

  const hideInfoBox = () => {
    infoBox.classList.add("hidden");
  };

  const showInfoBox = (clientX, clientY, html) => {
    const wrapperRect = mapWrapper.getBoundingClientRect();
    const boxWidth = 300;
    const boxHeight = 190;

    let left = clientX - wrapperRect.left + 16;
    let top = clientY - wrapperRect.top - boxHeight / 2;

    left = clamp(left, 16, wrapperRect.width - boxWidth - 16);
    top = clamp(top, 16, wrapperRect.height - boxHeight - 16);

    infoBox.style.setProperty("--info-left", `${left}px`);
    infoBox.style.setProperty("--info-top", `${top}px`);
    infoBoxContent.innerHTML = html;
    infoBox.classList.remove("hidden");
  };

  const setDistrictHeat = () => {
    const ca09Records = records.filter((r) => r.district === "CA-09");
    const support = ca09Records.filter((r) => r.stance === "support").length;
    const against = ca09Records.filter((r) => r.stance === "against").length;
    const total = Math.max(1, support + against);
    const supportRatio = support / total;

    const red = [239, 68, 68];
    const green = [34, 197, 94];
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const rgb = [
      lerp(red[0], green[0], supportRatio),
      lerp(red[1], green[1], supportRatio),
      lerp(red[2], green[2], supportRatio)
    ];
    const fill = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.26)`;

    mapWrapper.style.setProperty("--district-ca09-fill", fill);
    mapWrapper.style.setProperty("--district-active-fill", `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.18)`);
  };

  const loadCaliforniaFromJson = async () => {
    try {
      if (!svg) return;
      const regionsGroup = document.getElementById("ca-regions-group");
      const labelsGroup = document.getElementById("ca-labels-group");
      if (!regionsGroup || !labelsGroup) return;

      const res = await fetch("california.json");
      if (!res.ok) return;
      const data = await res.json();
      const features = Array.isArray(data.features) ? data.features : [];

      const polys = features.filter(
        (f) => f && f.geometry && f.geometry.type === "Polygon" && Array.isArray(f.geometry.coordinates)
      );
      if (!polys.length) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      polys.forEach((f) => {
        const rings = f.geometry.coordinates;
        const outer = Array.isArray(rings[0]) ? rings[0] : [];
        outer.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        });
      });

      const viewW = 480;
      const viewH = 640;
      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const scale = Math.min(viewW / spanX, viewH / spanY);
      const offsetX = (viewW - spanX * scale) / 2;
      const offsetY = (viewH - spanY * scale) / 2;

      const project = ([x, y]) => {
        const sx = (x - minX) * scale + offsetX;
        const sy = viewH - (y - minY) * scale - offsetY;
        return [sx, sy];
      };

      const SVG_NS = "http://www.w3.org/2000/svg";
      const existingCa09 = document.getElementById("district-ca-09");

      // Preserve CA-09 node so existing listeners keep working.
      const ca09Path = existingCa09 || document.createElementNS(SVG_NS, "path");

      regionsGroup.innerHTML = "";
      labelsGroup.innerHTML = "";

      polys.forEach((f) => {
        const rings = f.geometry.coordinates;
        const outer = Array.isArray(rings[0]) ? rings[0] : [];
        if (!outer.length) return;

        const projected = outer.map(project);
        let d = "";
        projected.forEach(([px, py], i) => {
          d += `${i === 0 ? "M" : "L"}${px} ${py} `;
        });
        d += "Z";

        const geoId = String(f.properties?.GEOID ?? "");
        const isCA09 = geoId === "09";

        const path = isCA09 ? ca09Path : document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", isCA09 ? "region district--active" : "region");
        if (isCA09) {
          path.id = "district-ca-09";
          regionsGroup.appendChild(path);

        }

        regionsGroup.appendChild(path);

        const cx = projected.reduce((sum, p) => sum + p[0], 0) / projected.length;
        const cy = projected.reduce((sum, p) => sum + p[1], 0) / projected.length;
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", String(cx));
        label.setAttribute("y", String(cy));
        label.setAttribute("class", isCA09 ? "district-label district-label--active" : "district-label");
        const districtLabel = String(f.properties?.CongDistrictLabel || geoId.padStart(2, "0"));
        label.textContent = districtLabel;
        labelsGroup.appendChild(label);
      });
    } catch (err) {
      console.error("Failed to load california.json", err);
    }
  };

  const renderIssueFilter = () => {
    const selected = issueFilter.value || "all";
    const issues = Array.from(new Set(records.map((r) => r.issue))).sort((a, b) => a.localeCompare(b));
    issueFilter.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All issues";
    issueFilter.appendChild(allOpt);

    issues.forEach((issue) => {
      const opt = document.createElement("option");
      opt.value = issue;
      opt.textContent = issue;
      issueFilter.appendChild(opt);
    });

    issueFilter.value = issues.includes(selected) ? selected : "all";
  };

  const renderKPIs = () => {
    kpiTotal.textContent = String(records.length);
    kpiSupport.textContent = String(records.filter((r) => r.stance === "support").length);
    kpiAgainst.textContent = String(records.filter((r) => r.stance === "against").length);
  };

  // Load California shape/districts from provided GeoJSON
  loadCaliforniaFromJson();

  const computeStanceCounts = () => {
    const counts = { support: 0, against: 0, neutral: 0 };
    records.forEach((r) => {
      counts[r.stance] += 1;
    });
    return counts;
  };

  const computeTopIssues = (limit = 6) => {
    const map = new Map();
    records.forEach((r) => {
      map.set(r.issue, (map.get(r.issue) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  };

  let stanceChart = null;
  let issuesChart = null;

  const ensureCharts = () => {
    const Chart = window.Chart;
    if (!Chart) return;
    if (!stanceChart) {
      stanceChart = new Chart(stanceChartCanvas, {
        type: "doughnut",
        data: {
          labels: ["Support", "Against", "Neutral"],
          datasets: [
            {
              data: [0, 0, 0],
              backgroundColor: ["rgba(34, 197, 94, 0.85)", "rgba(239, 68, 68, 0.85)", "rgba(148, 163, 184, 0.75)"],
              borderColor: ["rgba(34, 197, 94, 1)", "rgba(239, 68, 68, 1)", "rgba(148, 163, 184, 1)"],
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "rgba(226, 232, 240, 0.88)", boxWidth: 12, usePointStyle: true }
            }
          }
        }
      });
    }

    if (!issuesChart) {
      issuesChart = new Chart(issuesChartCanvas, {
        type: "bar",
        data: {
          labels: [],
          datasets: [
            {
              label: "Calls",
              data: [],
              backgroundColor: "rgba(250, 204, 21, 0.65)",
              borderColor: "rgba(250, 204, 21, 0.9)",
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
          },
          scales: {
            x: {
              ticks: { color: "rgba(226, 232, 240, 0.88)" },
              grid: { color: "rgba(148, 163, 184, 0.12)" }
            },
            y: {
              ticks: { color: "rgba(226, 232, 240, 0.88)", precision: 0 },
              grid: { color: "rgba(148, 163, 184, 0.12)" }
            }
          }
        }
      });
    }
  };

  const renderCharts = () => {
    ensureCharts();
    if (!stanceChart || !issuesChart) return;

    const stances = computeStanceCounts();
    stanceChart.data.datasets[0].data = [stances.support, stances.against, stances.neutral];
    stanceChart.update();

    const top = computeTopIssues(7);
    issuesChart.data.labels = top.map(([issue]) => issue);
    issuesChart.data.datasets[0].data = top.map(([, count]) => count);
    issuesChart.update();
  };

  const renderDots = () => {
    clearDots();
    const selectedIssue = issueFilter.value || "all";
    const show = records
      .filter((r) => r.district === "CA-09")
      .filter((r) => (selectedIssue === "all" ? true : r.issue === selectedIssue));

    if (!show.length) return;
    if (!svg || typeof ca09.isPointInFill !== "function" || !svg.getScreenCTM) return;

    const wrapperRect = mapWrapper.getBoundingClientRect();
    const districtRect = ca09.getBoundingClientRect();
    const w = Math.max(1, districtRect.width);
    const h = Math.max(1, districtRect.height);
    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const minDistance = 26;
    const placed = [];

    const toSvgPoint = (clientX, clientY) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(ctm.inverse());
    };

    const rngFor = (id) => mulberry32(hashToSeed(id));

    show.forEach((r, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `sample-dot ${
        r.stance === "support"
          ? "sample-dot--green"
          : r.stance === "against"
            ? "sample-dot--red"
            : "sample-dot--neutral"
      }`;

      const size = r.dot?.size ?? 18;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;

      const rng = rngFor(r.id);
      let chosen = null;
      let attempts = 0;

      while (attempts < 80 && !chosen) {
        attempts += 1;
        const nx = rng();
        const ny = rng();

        const centerClientX = districtRect.left + nx * w;
        const centerClientY = districtRect.top + ny * h;

        const svgPoint = toSvgPoint(centerClientX, centerClientY);
        if (!ca09.isPointInFill(svgPoint)) continue;

        const cx = centerClientX - wrapperRect.left;
        const cy = centerClientY - wrapperRect.top;

        const tooClose = placed.some((p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          return Math.sqrt(dx * dx + dy * dy) < minDistance;
        });
        if (tooClose) continue;

        chosen = { left: cx - size / 2, top: cy - size / 2, cx, cy };
      }

      if (!chosen) return;

      placed.push({ x: chosen.cx, y: chosen.cy });
      dot.style.left = `${chosen.left}px`;
      dot.style.top = `${chosen.top}px`;
      dot.style.animationDelay = `${index * 0.01}s`;

      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        const stanceLabel = r.stance === "support" ? "Support" : r.stance === "against" ? "Against" : "Neutral";
        const html = `
          <div style="font-weight:800; letter-spacing:-0.02em; margin-bottom:6px;">${escapeHtml(r.issue)}</div>
          <div style="color:rgba(226,232,240,0.86); font-size:12px; margin-bottom:8px;">
            ${escapeHtml(stanceLabel)} · ${escapeHtml(r.zipcode)} · ${escapeHtml(r.district)}
          </div>
          <div style="font-size:13px; line-height:1.5; color:rgba(248,250,252,0.92);">
            ${escapeHtml(r.summary)}
          </div>
        `;
        showInfoBox(event.clientX, event.clientY, html);
      });

      dotLayer.appendChild(dot);
    });
  };

  const zoomInToDistrict = () => {
    const bbox = ca09.getBBox();
    const pad = 18;
    const zoomViewBox = [bbox.x - pad, bbox.y - pad, bbox.width + pad * 2, bbox.height + pad * 2].join(" ");
    svg.setAttribute("viewBox", zoomViewBox);
    mapWrapper.classList.add("is-zoomed");
    zoomOutBtn.classList.remove("hidden");
    window.setTimeout(renderDots, 380);
  };

  const zoomOut = () => {
    svg.setAttribute("viewBox", defaultViewBox);
    mapWrapper.classList.remove("is-zoomed");
    zoomOutBtn.classList.add("hidden");
    clearDots();
    hideInfoBox();
  };

  const upsertRecord = (r) => {
    records.unshift(r);
    renderIssueFilter();
    renderKPIs();
    renderCharts();
    setDistrictHeat();
    if (mapWrapper.classList.contains("is-zoomed")) {
      renderDots();
    }
  };

  const mockAnalyzeTranscript = ({ transcript, phone }) => {
    const text = String(transcript ?? "").trim();
    const lower = text.toLowerCase();

    const issueRules = [
      { issue: "Clean Energy", re: /\b(clean energy|renewable|solar|wind|carbon|emissions?)\b/i },
      { issue: "Healthcare", re: /\b(healthcare|medicaid|medicare|insurance|hospitals?)\b/i },
      { issue: "Immigration", re: /\b(immigration|border|asylum|undocumented)\b/i },
      { issue: "Housing", re: /\b(housing|rent|zoning|homeless|affordable)\b/i },
      { issue: "Education", re: /\b(education|schools?|teachers?|college|student)\b/i },
      { issue: "Taxes", re: /\b(taxes?|taxation|irs|property tax)\b/i },
      { issue: "Public Safety", re: /\b(crime|police|safety|guns?|violence)\b/i }
    ];

    let issue = "General Policy";
    for (const r of issueRules) {
      if (r.re.test(text)) {
        issue = r.issue;
        break;
      }
    }

    const supportRe = /\b(i\s+support|i'm\s+for|i\s+am\s+for|in\s+favor|approve|vote\s+yes|yes\s+on)\b/i;
    const againstRe = /\b(i\s+oppose|i'm\s+against|i\s+am\s+against|against|reject|vote\s+no|no\s+on)\b/i;
    let stance = "neutral";
    if (supportRe.test(lower) && !againstRe.test(lower)) stance = "support";
    if (againstRe.test(lower) && !supportRe.test(lower)) stance = "against";

    const zipcode = deriveZipFromPhone(phone);
    const district = "CA-09";
    const summary = text.length > 180 ? `${text.slice(0, 180).trim()}…` : text || "No transcript provided.";

    return {
      issue,
      stance,
      summary,
      zipcode,
      district
    };
  };

  const analyzeTranscript = async ({ transcript, phone }) => {
    const payload = { transcript, phone };
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;
    } catch {
      return mockAnalyzeTranscript(payload);
    }
  };

  // Speech-to-text
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSTT = Boolean(SpeechRecognition);
  let recognition = null;
  let listening = false;

  const setListeningUI = (on) => {
    listening = on;
    micBtn.classList.toggle("op-btn--listening", on);
    micBtnText.textContent = on ? "Stop mic" : "Start mic";
  };

  const ensureRecognition = () => {
    if (!hasSTT) return null;
    if (recognition) return recognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListeningUI(true);
      setStatus("Listening…");
    };

    recognition.onerror = (e) => {
      setListeningUI(false);
      setStatus(e?.error ? `Mic error: ${e.error}` : "Mic error.");
    };

    recognition.onend = () => {
      setListeningUI(false);
      setStatus("Mic stopped.");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }

      if (finalText) {
        const existing = transcriptInput.value.trim();
        transcriptInput.value = existing ? `${existing} ${finalText}`.trim() : finalText.trim();
      }

      analyzeBtn.disabled = transcriptInput.value.trim().length === 0;
      setStatus(interimText ? `Hearing: ${interimText.trim()}` : "Listening…");
    };

    return recognition;
  };

  const stopMic = () => {
    listening = false;
    try {
      recognition?.stop?.();
    } catch {
      // ignore
    }
    setListeningUI(false);
    setStatus("Mic stopped.");
  };

  const startMic = () => {
    if (!hasSTT) {
      setStatus("Speech-to-text not supported in this browser. Type into the transcript box instead.");
      return;
    }
    const r = ensureRecognition();
    if (!r) return;
    listening = true;
    try {
      r.start();
    } catch {
      // Some browsers throw if start called twice
      setListeningUI(true);
      setStatus("Listening…");
    }
  };

  micBtn.addEventListener("click", () => {
    if (listening) stopMic();
    else startMic();
  });

  clearBtn.addEventListener("click", () => {
    transcriptInput.value = "";
    setStatus("");
    analyzeBtn.disabled = true;
  });

  transcriptInput.addEventListener("input", () => {
    analyzeBtn.disabled = transcriptInput.value.trim().length === 0;
  });

  analyzeBtn.addEventListener("click", async () => {
    const transcript = transcriptInput.value.trim();
    if (!transcript) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing…";
    setStatus("Sending transcript for analysis…");

    const phone = normalizePhone(phoneInput.value) || "5551234567";
    const analysis = await analyzeTranscript({ transcript, phone });

    const stance = analysis?.stance === "support" || analysis?.stance === "against" ? analysis.stance : "neutral";
    const issue = String(analysis?.issue ?? "General Policy");
    const summary = String(analysis?.summary ?? "").trim() || (transcript.length > 180 ? `${transcript.slice(0, 180).trim()}…` : transcript);
    const zipcode = String(analysis?.zipcode ?? deriveZipFromPhone(phone));
    const district = String(analysis?.district ?? "CA-09");

    const id = `call_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const rng = mulberry32(hashToSeed(id));
    const dot = { nx: rng(), ny: rng(), size: 12 + rng() * 16 };

    upsertRecord({
      id,
      createdAt: nowIso(),
      phone,
      zipcode,
      district,
      issue,
      stance,
      summary,
      transcript,
      dot
    });

    resultStance.textContent = stance === "support" ? "Support" : stance === "against" ? "Against" : "Neutral";
    resultStance.dataset.stance = stance;
    resultIssue.textContent = `Issue: ${issue}`;
    resultGeo.textContent = `Zip/District: ${zipcode} · ${district}`;
    resultSummary.textContent = `Summary: ${summary}`;

    setStatus("Done. Record added to dashboard.");
    analyzeBtn.textContent = "Analyze";
    analyzeBtn.disabled = transcriptInput.value.trim().length === 0;

    if (!mapWrapper.classList.contains("is-zoomed")) {
      zoomInToDistrict();
    }
  });

  issueFilter.addEventListener("change", () => {
    if (mapWrapper.classList.contains("is-zoomed")) {
      renderDots();
    }
  });

  // Map interactions
  ca09.addEventListener("click", (event) => {
    event.stopPropagation();
    if (mapWrapper.classList.contains("is-zoomed")) return;
    hideInfoBox();
    zoomInToDistrict();
  });

  mapWrapper.addEventListener("click", () => {
    hideInfoBox();
  });

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hideInfoBox();
  });

  infoBoxInner.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  zoomOutBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    zoomOut();
  });

  window.addEventListener("resize", () => {
    if (mapWrapper.classList.contains("is-zoomed")) {
      renderDots();
    }
  });

  // Seed sample records for the demo
  const seedSampleRecords = () => {
    const samples = [
      { issue: "Clean Energy", stance: "support", summary: "Supports clean energy incentives to reduce bills and emissions." },
      { issue: "Housing", stance: "support", summary: "Supports zoning reform and more affordable housing development." },
      { issue: "Taxes", stance: "against", summary: "Opposes increasing property taxes due to cost-of-living concerns." },
      { issue: "Healthcare", stance: "support", summary: "Supports expanding healthcare coverage and lowering prescription costs." },
      { issue: "Immigration", stance: "against", summary: "Opposes policy changes perceived to weaken border enforcement." },
      { issue: "Education", stance: "support", summary: "Supports teacher pay and school funding improvements." },
      { issue: "Public Safety", stance: "against", summary: "Opposes changes that could reduce enforcement resources." }
    ];

    const basePhone = "5551230000";
    for (let i = 0; i < 24; i++) {
      const s = samples[i % samples.length];
      const id = `seed_${i}`;
      const rng = mulberry32(hashToSeed(id));
      const phone = String(Number(basePhone) + i);
      upsertRecord({
        id,
        createdAt: nowIso(),
        phone,
        zipcode: deriveZipFromPhone(phone),
        district: "CA-09",
        issue: s.issue,
        stance: s.stance,
        summary: s.summary,
        transcript: s.summary,
        dot: { nx: rng(), ny: rng(), size: 12 + rng() * 16 }
      });
    }
  };

  seedSampleRecords();
  renderIssueFilter();
  renderKPIs();
  renderCharts();
  setDistrictHeat();

  analyzeBtn.disabled = transcriptInput.value.trim().length === 0;
  setStatus(hasSTT ? "Ready. Click Start mic to record." : "Ready. Type a transcript (speech-to-text not supported here).");
});
