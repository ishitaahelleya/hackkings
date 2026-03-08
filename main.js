document.addEventListener("DOMContentLoaded", async () => {

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

const startRecordingBtn = document.getElementById("start-recording-btn");

const kpiTotal = document.getElementById("kpi-total");
const kpiSupport = document.getElementById("kpi-support");
const kpiAgainst = document.getElementById("kpi-against");

<<<<<<< HEAD
const stanceChartCanvas = document.getElementById("stance-chart");
const issuesChartCanvas = document.getElementById("issues-chart");
const issueFilter = document.getElementById("issue-filter");
=======
  const kpiTotal = document.getElementById("kpi-total");
  const kpiSupport = document.getElementById("kpi-support");
  const kpiAgainst = document.getElementById("kpi-against");
  const kpiNeutral = document.getElementById("kpi-neutral");
>>>>>>> refs/remotes/origin/main

const detailModal = document.getElementById("detail-modal");
const detailModalClose = document.getElementById("detail-modal-close");
const detailModalTitle = document.getElementById("detail-modal-title");
const detailModalMeta = document.getElementById("detail-modal-meta");
const detailModalSummary = document.getElementById("detail-modal-summary");
const detailModalTranscript = document.getElementById("detail-modal-transcript");

const records = [];

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

window.setTimeout(() => pageLoader?.classList.add("done"), 1600);

function clamp(n,min,max){
  return Math.max(min,Math.min(max,n));
}

function mulberry32(seed){
  let a = seed >>> 0;
  return ()=>{
    a|=0;a=(a+0x6d2b79f5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return((t^(t>>>14))>>>0)/4294967296;
  };
}

function hashToSeed(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

function escapeHtml(v){
  return String(v??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function renderKPIs(){
  kpiTotal.textContent = records.length;
  kpiSupport.textContent =
    records.filter(r=>r.stance==="support").length;
  kpiAgainst.textContent =
    records.filter(r=>r.stance==="against").length;
}

function computeStanceCounts(){
  const c={support:0,against:0,neutral:0};
  records.forEach(r=>c[r.stance]++);
  return c;
}

function computeTopIssues(){
  const map=new Map();
  records.forEach(r=>{
    map.set(r.issue,(map.get(r.issue)||0)+1);
  });
  return [...map.entries()]
    .sort((a,b)=>b[1]-a[1])
    .slice(0,7);
}

let stanceChart=null;
let issuesChart=null;

function ensureCharts(){

  if(!window.Chart) return;

  if(!stanceChart){
    stanceChart = new Chart(stanceChartCanvas,{
      type:"doughnut",
      data:{
        labels:["Support","Against","Neutral"],
        datasets:[{
          data:[0,0,0],
          backgroundColor:[
            "rgba(34,197,94,0.85)",
            "rgba(239,68,68,0.85)",
            "rgba(148,163,184,0.75)"
          ]
        }]
      }
    });
  }

  if(!issuesChart){
    issuesChart = new Chart(issuesChartCanvas,{
      type:"bar",
      data:{
        labels:[],
        datasets:[{
          data:[],
          backgroundColor:"rgba(250,204,21,0.7)"
        }]
      }
    });
  }
}

<<<<<<< HEAD
function renderCharts(){
=======
  const renderKPIs=()=>{
    kpiTotal.textContent=records.length;
    kpiSupport.textContent=records.filter(r=>r.stance==="support").length;
    kpiAgainst.textContent=records.filter(r=>r.stance==="against").length;
    if(kpiNeutral)kpiNeutral.textContent=records.filter(r=>r.stance==="neutral").length;
  };
>>>>>>> refs/remotes/origin/main

  ensureCharts();

  const stanceCounts = computeStanceCounts();

  stanceChart.data.datasets[0].data = [
    stanceCounts.support,
    stanceCounts.against,
    stanceCounts.neutral
  ];

  stanceChart.update();

  const issues = computeTopIssues();

  issuesChart.data.labels = issues.map(i=>i[0]);
  issuesChart.data.datasets[0].data = issues.map(i=>i[1]);

  issuesChart.update();
}

function renderIssueFilter(){

  const issues=[...new Set(records.map(r=>r.issue))];

  issueFilter.innerHTML="";

  const all=document.createElement("option");
  all.value="all";
  all.textContent="All issues";

  issueFilter.appendChild(all);

  issues.forEach(issue=>{
    const o=document.createElement("option");
    o.value=issue;
    o.textContent=issue;
    issueFilter.appendChild(o);
  });
}

function showInfoBox(x,y,html){

  const rect = mapWrapper.getBoundingClientRect();

  let left = x - rect.left + 16;
  let top = y - rect.top - 80;

  left = clamp(left,16,rect.width-260);

  infoBox.style.setProperty("--info-left",`${left}px`);
  infoBox.style.setProperty("--info-top",`${top}px`);

  infoBoxContent.innerHTML = html;
  infoBox.classList.remove("hidden");
}

function hideInfoBox(){
  infoBox.classList.add("hidden");
}

function openDetailModal(record){
  detailModalTitle.textContent = `Caller ${record.id}`;
  detailModalMeta.textContent = `${record.issue} • ${record.stance}`;
  detailModalSummary.textContent = record.summary || "No summary available.";
  detailModalTranscript.textContent = record.transcript || "No transcript available.";
  detailModal.classList.remove("hidden");
  detailModal.setAttribute("aria-hidden","false");
}

function closeDetailModal(){
  detailModal.classList.add("hidden");
  detailModal.setAttribute("aria-hidden","true");
}

function renderDots(){

  dotLayer.innerHTML="";

  const rect = mapWrapper.getBoundingClientRect();
  const districtRect = ca09.getBoundingClientRect();

  const w = districtRect.width;
  const h = districtRect.height;

  records.forEach(r=>{

    const dot=document.createElement("button");

    dot.className=`sample-dot ${
      r.stance==="support"
      ?"sample-dot--green"
      :r.stance==="against"
      ?"sample-dot--red"
      :"sample-dot--neutral"
    }`;

    const size=r.dot.size;

    dot.style.width=size+"px";
    dot.style.height=size+"px";

    const x=districtRect.left+r.dot.nx*w;
    const y=districtRect.top+r.dot.ny*h;

    dot.style.left=(x-rect.left-size/2)+"px";
    dot.style.top=(y-rect.top-size/2)+"px";

    dot.addEventListener("click",e=>{

      e.stopPropagation();

      showInfoBox(e.clientX,e.clientY,`

<div style="font-weight:700;margin-bottom:4px;">
Caller ${r.id}
</div>

<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">
${escapeHtml(r.issue)} • ${escapeHtml(r.stance)}
</div>

<div style="font-size:13px;">
${escapeHtml(r.summary)}
</div>

<button
  type="button"
  class="dot-popup-more-btn"
  data-record-id="${escapeHtml(r.id)}"
  style="
    margin-top:8px;
    padding:4px 8px;
    border-radius:8px;
    border:1px solid rgba(255,255,255,0.2);
    background:rgba(15,23,42,0.8);
    color:white;
    font-size:12px;
    cursor:pointer;
  "
>
More
</button>

      `);

      const moreBtn = infoBoxContent.querySelector(".dot-popup-more-btn");
      if(moreBtn){
        moreBtn.addEventListener("click",(evt)=>{
          evt.stopPropagation();
          openDetailModal(r);
        });
      }

    });

    dotLayer.appendChild(dot);
  });
}

function upsertRecord(r){
  records.push(r);
  renderKPIs();
  renderCharts();
  renderIssueFilter();
  renderDots();
}

function zoomToCA09(){

  const bbox = ca09.getBBox();
  const pad = 20;

  const viewBox = [
    bbox.x - pad,
    bbox.y - pad,
    bbox.width + pad*2,
    bbox.height + pad*2
  ].join(" ");

  svg.setAttribute("viewBox",viewBox);
  mapWrapper.classList.add("is-zoomed");
}

async function loadCSV(){

  const res = await fetch("calls_dataset.csv");
  const text = await res.text();

  const rows = text.split("\n").slice(1);

  rows.forEach((line,i)=>{

    if(!line.trim()) return;

    const cols=line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    if(!cols || cols.length < 2) return;

    const clean = cols.map(v => String(v).replace(/^"|"$/g, "").trim());

    const transcript = clean[1] || "";
    const billName = clean[2] || "";
    const billStance = clean[3] || "";
    const billReason = clean[4] || "";
    const issueName = clean[5] || "";
    const issueStance = clean[6] || "";
    const issueReason = clean[7] || "";

    const stance =
      issueStance.toLowerCase() ||
      billStance.toLowerCase() ||
      "neutral";

    const issue =
      issueName ||
      billName ||
      "General Policy";

    const summary =
      issueReason ||
      billReason ||
      transcript.slice(0,120);

    const id = String(i+1);

    const rng = mulberry32(hashToSeed(id));

    upsertRecord({
      id,
      issue,
      stance: stance==="support"||stance==="against"?stance:"neutral",
      summary,
      transcript,
      dot:{
        nx:rng(),
        ny:rng(),
        size:12+rng()*16
      }
    });

  });
}

await loadCSV();

zoomToCA09();

renderKPIs();
renderCharts();
renderIssueFilter();
renderDots();

closeBtn?.addEventListener("click",(e)=>{
  e.stopPropagation();
  hideInfoBox();
});

infoBoxInner?.addEventListener("click",(e)=>{
  e.stopPropagation();
});

mapWrapper?.addEventListener("click",()=>{
  hideInfoBox();
});

detailModalClose?.addEventListener("click", closeDetailModal);

detailModal?.querySelector(".detail-modal-backdrop")?.addEventListener("click", closeDetailModal);

document.addEventListener("keydown",(e)=>{
  if(e.key === "Escape"){
    hideInfoBox();
    closeDetailModal();
  }
});

/* =========================
   RECORDING BUTTON LOGIC
   ========================= */

startRecordingBtn?.addEventListener("click", async () => {

  if(!isRecording){

    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e=>{
        if(e.data.size>0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = ()=>{
        const blob = new Blob(audioChunks,{type:"audio/webm"});
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "recording.webm";
        a.click();
      };

      mediaRecorder.start();
      isRecording = true;
      startRecordingBtn.textContent = "Stop Recording";

    }catch(err){
      console.error("Microphone access denied",err);
      alert("Microphone permission is required to record.");
    }

  } else {

    mediaRecorder.stop();
    isRecording = false;
    startRecordingBtn.textContent = "Start Recording";

  }

});

});