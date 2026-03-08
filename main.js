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
  const kpiNeutral = document.getElementById("kpi-neutral");

  const stanceChartCanvas = document.getElementById("stance-chart");
  const issuesChartCanvas = document.getElementById("issues-chart");
  const issueFilter = document.getElementById("issue-filter");

  const records = [];

  const nowIso = () => new Date().toISOString();

  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

  const mulberry32 = seed=>{
    let a=seed>>>0;
    return ()=>{
      a|=0;a=(a+0x6d2b79f5)|0;
      let t=Math.imul(a^(a>>>15),1|a);
      t=(t+Math.imul(t^(t>>>7),61|t))^t;
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  };

  const hashToSeed=str=>{
    const s=String(str??"");
    let h=2166136261;
    for(let i=0;i<s.length;i++){
      h^=s.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return h>>>0;
  };

  const deriveZipFromPhone=(p)=>{
    const digits=String(p??"").replace(/\D/g,"");
    const last5=digits.slice(-5);
    return last5.length===5?last5:"95202";
  };

  const escapeHtml=v=>String(v??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  const setStatus=t=>{ sttStatus.textContent=t??"" };

  window.setTimeout(()=>pageLoader?.classList.add("done"),1600);

  const clearDots=()=>{ dotLayer.innerHTML="" };

  const hideInfoBox=()=>{ infoBox?.classList.add("hidden") };

  const showInfoBox=(clientX,clientY,html)=>{
    const wrapperRect=mapWrapper.getBoundingClientRect();
    const boxWidth=300;
    const boxHeight=190;

    let left=clientX-wrapperRect.left+16;
    let top=clientY-wrapperRect.top-boxHeight/2;

    left=clamp(left,16,wrapperRect.width-boxWidth-16);
    top=clamp(top,16,wrapperRect.height-boxHeight-16);

    infoBox.style.setProperty("--info-left",`${left}px`);
    infoBox.style.setProperty("--info-top",`${top}px`);
    infoBoxContent.innerHTML=html;
    infoBox.classList.remove("hidden");
  };

  const renderKPIs=()=>{
    kpiTotal.textContent=records.length;
    kpiSupport.textContent=records.filter(r=>r.stance==="support").length;
    kpiAgainst.textContent=records.filter(r=>r.stance==="against").length;
    if(kpiNeutral)kpiNeutral.textContent=records.filter(r=>r.stance==="neutral").length;
  };

  const computeStanceCounts=()=>{
    const c={support:0,against:0,neutral:0};
    records.forEach(r=>{c[r.stance]+=1});
    return c;
  };

  const computeTopIssues=(limit=7)=>{
    const map=new Map();
    records.forEach(r=>{
      map.set(r.issue,(map.get(r.issue)||0)+1);
    });

    return [...map.entries()]
      .sort((a,b)=>b[1]-a[1])
      .slice(0,limit);
  };

  let stanceChart=null;
  let issuesChart=null;

  const ensureCharts=()=>{
    const Chart=window.Chart;
    if(!Chart)return;

    if(!stanceChart){
      stanceChart=new Chart(stanceChartCanvas,{
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
      issuesChart=new Chart(issuesChartCanvas,{
        type:"bar",
        data:{
          labels:[],
          datasets:[{
            label:"Calls",
            data:[],
            backgroundColor:"rgba(250,204,21,0.7)"
          }]
        }
      });
    }
  };

  const renderCharts=()=>{
    ensureCharts();
    if(!stanceChart||!issuesChart)return;

    const stanceCounts=computeStanceCounts();

    stanceChart.data.datasets[0].data=[
      stanceCounts.support,
      stanceCounts.against,
      stanceCounts.neutral
    ];

    stanceChart.update();

    const issues=computeTopIssues();

    issuesChart.data.labels=issues.map(i=>i[0]);
    issuesChart.data.datasets[0].data=issues.map(i=>i[1]);

    issuesChart.update();
  };

  const renderIssueFilter=()=>{
    const selected=issueFilter.value||"all";
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

    issueFilter.value=issues.includes(selected)?selected:"all";
  };

  const upsertRecord=r=>{
    records.unshift(r);
    renderIssueFilter();
    renderKPIs();
    renderCharts();
  };

  // CSV LOADER
  const loadCSVRecords=async()=>{
    try {
    const res=await fetch("calls_dataset.csv");
    if(!res.ok)return;
    const text=await res.text();

    const rows=text.trim().split("\n");
    const headers=rows[0].split(",");

    for(let i=1;i<rows.length;i++){

      const values=rows[i].split(",");
      const row={};

      headers.forEach((h,j)=>{
        row[h.trim()]=values[j]?values[j].trim():"";
      });

      const id=`csv_${i}`;
      const rng=mulberry32(hashToSeed(id));

      const stance=
        row.issue_stance?.toLowerCase() ||
        row.bill_stance?.toLowerCase() ||
        "neutral";

      const issue=
        row.issue_name ||
        row.bill_name ||
        "General Policy";

      const summary=
        row.issue_reason ||
        row.bill_reason ||
        row.transcript_text?.slice(0,180) ||
        "No summary available";

      upsertRecord({
        id,
        createdAt:row.call_timestamp||nowIso(),
        phone:row.phone_number||"0000000000",
        zipcode:row.zip_code||deriveZipFromPhone(row.phone_number),
        district:row.district||"CA-09",
        issue,
        stance:stance==="support"||stance==="against"?stance:"neutral",
        summary,
        transcript:row.transcript_text||"",
        dot:{
          nx:rng(),
          ny:rng(),
          size:12+rng()*16
        }
      });
    }
    } catch (_) {
      // CSV missing or invalid – run with empty records
    }
  };

  await loadCSVRecords();

  renderIssueFilter();
  renderKPIs();
  renderCharts();

  analyzeBtn.disabled = transcriptInput.value.trim().length === 0;

  setStatus("Ready. Click Start mic to record.");

});