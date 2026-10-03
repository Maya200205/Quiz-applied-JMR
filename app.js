const SUPABASE_URL = "https://jjrfduoqpaesnuzxomze.supabase.co";
const SUPABASE_KEY = "sb_publishable_1LVqf-8DBD49prvj7hGvDw_lTyA46PF";
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;


let bank = [];
let session = [];
let current = 0;
let sessionCorrect = 0;
let locked = false;
let sessionAnswers = [];
let sessionStartedAt = 0;
let sessionActiveSeconds = 0;
let timerHandle = null;
let lastInteraction = Date.now();
let currentMode = "";

const $ = id => document.getElementById(id);
const homeView = $("homeView");
const quizView = $("quizView");
const resultView = $("resultView");

const DEFAULT_STATE = {
  seen:{},
  wrong:{},
  totalAnswered:0,
  totalCorrect:0,
  activeSeconds:0,
  bestStreak:0,
  currentStreak:0,
  nickname:"",
  sessions:[]
};

function getState(){
  let raw={};
  try{ raw=JSON.parse(localStorage.getItem("pcbQuizProgress") || "{}"); }catch(e){}
  return {
    ...DEFAULT_STATE,
    ...raw,
    seen: raw.seen || {},
    wrong: raw.wrong || {},
    sessions: Array.isArray(raw.sessions) ? raw.sessions : []
  };
}
function saveState(s){ localStorage.setItem("pcbQuizProgress", JSON.stringify(s)); }

function fmtDuration(sec){
  sec=Math.max(0,Math.round(sec||0));
  if(sec < 60) return `${sec}s`;
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtClock(sec){
  sec=Math.max(0,Math.round(sec||0));
  const m=Math.floor(sec/60), s=sec%60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function uniqueSeenCount(s){ return Object.keys(s.seen||{}).length; }
function wrongCount(s){ return Object.keys(s.wrong||{}).length; }
function masteredCount(s){ return Math.max(0, uniqueSeenCount(s)-wrongCount(s)); }
function accuracy(s){ return s.totalAnswered ? s.totalCorrect/s.totalAnswered : 0; }
function coverage(s){ return bank.length ? uniqueSeenCount(s)/bank.length : 0; }
function mastery(s){ return bank.length ? masteredCount(s)/bank.length : 0; }

function readiness(s){
  if(!s.totalAnswered || !bank.length) return 0;
  const acc=accuracy(s);
  const cov=coverage(s);
  const mas=mastery(s);
  const consistency=Math.min(1,(s.totalAnswered||0)/Math.max(20,bank.length));
  return Math.round(100*(0.45*acc + 0.25*cov + 0.20*mas + 0.10*consistency));
}
function readinessCopy(v){
  if(v<25) return ["Start practising","You are building your first revision baseline."];
  if(v<50) return ["Keep practising","You have started covering the chapter, but there is still a lot to consolidate."];
  if(v<70) return ["Getting there","Your foundations are developing. Keep reviewing missed questions."];
  if(v<85) return ["Good progress","You are showing solid quiz performance with useful chapter coverage."];
  if(v<95) return ["Very well prepared","Your practice results are strong. Keep checking weak spots."];
  return ["Excellent mastery","Your quiz results show very strong coverage and accuracy."];
}

async function init(){
  const paths=["chapter1.json","data/chapter1.json"];
  let data=null;
  for(const path of paths){
    try{
      const res=await fetch(path,{cache:"no-store"});
      if(res.ok){ data=await res.json(); break; }
    }catch(e){}
  }
  if(!data || !Array.isArray(data.questions)){
    alert("The Chapter 1 question file could not be loaded.");
    return;
  }
  bank=data.questions;
  const s=getState();
  $("nickname").value=s.nickname||"";
  $("chapterCount").textContent=`${bank.length} questions`;
  renderDashboard();
  bindActivityTracking();
}

function bindActivityTracking(){
  ["click","keydown","touchstart"].forEach(evt=>{
    window.addEventListener(evt,()=>{ lastInteraction=Date.now(); },{passive:true});
  });
}

function renderDashboard(){
  const s=getState();
  const acc=accuracy(s), cov=coverage(s), mas=mastery(s), ready=readiness(s);
  const [label,txt]=readinessCopy(ready);

  $("accuracyStat").textContent=s.totalAnswered ? `${Math.round(acc*100)}%` : "—";
  $("accuracyCaption").textContent=s.totalAnswered ? `${s.totalCorrect} correct / ${s.totalAnswered} answered` : "No answers yet";
  $("coverageStat").textContent=`${Math.round(cov*100)}%`;
  $("coverageCaption").textContent=`${uniqueSeenCount(s)} / ${bank.length} questions seen`;
  $("studyTimeStat").textContent=fmtDuration(s.activeSeconds);
  $("streakStat").textContent=s.bestStreak||0;
  $("mistakeBadge").textContent=wrongCount(s);
  $("chapterCoverageText").textContent=`${Math.round(cov*100)}%`;
  $("chapterCoverageBar").style.width=`${Math.round(cov*100)}%`;
  $("readinessValue").textContent=`${ready}%`;
  $("readinessLabel").textContent=label;
  $("readinessText").textContent=txt;
  $("readinessRing").style.setProperty("--p",ready);
  $("liveTimePill").textContent=`⏱ ${fmtDuration(s.activeSeconds)} active`;

  $("progressBreakdown").innerHTML = [
    ["Accuracy",Math.round(acc*100)],
    ["Chapter coverage",Math.round(cov*100)],
    ["Questions mastered",Math.round(mas*100)],
    ["Mistakes cleared", Math.round((uniqueSeenCount(s) ? masteredCount(s)/uniqueSeenCount(s) : 0)*100)]
  ].map(([name,val])=>`
    <div class="breakdown-row">
      <div class="row-top"><span>${name}</span><strong>${val}%</strong></div>
      <div class="progress-track"><div class="progress-fill" style="width:${val}%"></div></div>
    </div>`).join("");

  renderLeaderboards(s);
}

function renderLeaderboards(s){
  renderLocalFallbackLeaderboards(s);
  loadGlobalLeaderboards();
}

function renderLocalFallbackLeaderboards(s){
  const sessions=[...(s.sessions||[])];
  const scoreEl=$("scoreLeaderboard");
  if(!sessions.length){
    scoreEl.innerHTML='<div class="empty-state">No leaderboard results yet. Finish a quiz to add the first one.</div>';
  }else{
    const ranked=sessions
      .sort((a,b)=>b.percentage-a.percentage || b.questions-a.questions || a.seconds-b.seconds)
      .slice(0,5);
    scoreEl.innerHTML=ranked.map((x,i)=>`
      <div class="leader-row">
        <div class="rank ${i===0?"top":""}">${i+1}</div>
        <div>
          <div class="leader-name">${escapeHtml(x.nickname||"Anonymous")}</div>
          <div class="leader-meta">${x.correct}/${x.questions} · ${fmtDuration(x.seconds)} · local fallback</div>
        </div>
        <div class="leader-score">${x.percentage}%</div>
      </div>`).join("");
  }

  const profiles={};
  sessions.forEach(x=>{
    const n=x.nickname||"Anonymous";
    if(!profiles[n]) profiles[n]={seconds:0,sessions:0,questions:0};
    profiles[n].seconds+=x.seconds||0;
    profiles[n].sessions++;
    profiles[n].questions+=x.questions||0;
  });

  const rows=Object.entries(profiles).sort((a,b)=>b[1].seconds-a[1].seconds).slice(0,5);
  const timeEl=$("timeLeaderboard");
  if(!rows.length){
    timeEl.innerHTML='<div class="empty-state">No study-time results yet.</div>';
  }else{
    timeEl.innerHTML=rows.map(([name,v],i)=>`
      <div class="leader-row">
        <div class="rank ${i===0?"top":""}">${i+1}</div>
        <div>
          <div class="leader-name">${escapeHtml(name)}</div>
          <div class="leader-meta">${v.sessions} session${v.sessions===1?"":"s"} · ${v.questions} questions</div>
        </div>
        <div class="leader-score">${fmtDuration(v.seconds)}</div>
      </div>`).join("");
  }
}

async function submitGlobalResult(result){
  if(!supabaseClient) return;
  try{
    const { error } = await supabaseClient.from("quiz_results").insert({
      nickname: result.nickname,
      chapter: "chapter1",
      score: result.correct,
      total_questions: result.questions,
      percentage: result.percentage,
      active_seconds: result.seconds
    });
    if(error) console.error("Supabase insert error:", error);
  }catch(err){
    console.error("Could not submit global result:", err);
  }
}

async function loadGlobalLeaderboards(){
  if(!supabaseClient) return;

  try{
    const { data, error } = await supabaseClient
      .from("quiz_results")
      .select("nickname,score,total_questions,percentage,active_seconds,created_at")
      .eq("chapter","chapter1")
      .order("created_at",{ascending:false})
      .limit(1000);

    if(error) throw error;
    const rows=Array.isArray(data)?data:[];

    const bestByName={};
    rows.forEach(r=>{
      const name=(r.nickname||"Anonymous").trim()||"Anonymous";
      const prev=bestByName[name];
      if(
        !prev ||
        r.percentage>prev.percentage ||
        (r.percentage===prev.percentage && r.total_questions>prev.total_questions) ||
        (r.percentage===prev.percentage && r.total_questions===prev.total_questions &&
         new Date(r.created_at)>new Date(prev.created_at))
      ){
        bestByName[name]=r;
      }
    });

    const best=Object.entries(bestByName)
      .map(([nickname,r])=>({nickname,...r}))
      .sort((a,b)=>b.percentage-a.percentage || b.total_questions-a.total_questions || b.score-a.score)
      .slice(0,10);

    const scoreEl=$("scoreLeaderboard");
    scoreEl.innerHTML=best.length
      ? best.map((x,i)=>`
          <div class="leader-row">
            <div class="rank ${i===0?"top":""}">${i+1}</div>
            <div>
              <div class="leader-name">${escapeHtml(x.nickname)}</div>
              <div class="leader-meta">${x.score}/${x.total_questions} · best submitted result</div>
            </div>
            <div class="leader-score">${x.percentage}%</div>
          </div>`).join("")
      : '<div class="empty-state">No global scores yet. Be the first!</div>';

    const timeByName={};
    rows.forEach(r=>{
      const name=(r.nickname||"Anonymous").trim()||"Anonymous";
      if(!timeByName[name]) timeByName[name]={seconds:0,sessions:0,questions:0};
      timeByName[name].seconds += Number(r.active_seconds)||0;
      timeByName[name].sessions += 1;
      timeByName[name].questions += Number(r.total_questions)||0;
    });

    const timeRows=Object.entries(timeByName)
      .map(([nickname,v])=>({nickname,...v}))
      .sort((a,b)=>b.seconds-a.seconds)
      .slice(0,10);

    const timeEl=$("timeLeaderboard");
    timeEl.innerHTML=timeRows.length
      ? timeRows.map((x,i)=>`
          <div class="leader-row">
            <div class="rank ${i===0?"top":""}">${i+1}</div>
            <div>
              <div class="leader-name">${escapeHtml(x.nickname)}</div>
              <div class="leader-meta">${x.sessions} session${x.sessions===1?"":"s"} · ${x.questions} questions</div>
            </div>
            <div class="leader-score">${fmtDuration(x.seconds)}</div>
          </div>`).join("")
      : '<div class="empty-state">No global study-time data yet.</div>';

  }catch(err){
    console.error("Could not load global leaderboards:", err);
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function saveNickname(){
  const s=getState();
  s.nickname=$("nickname").value.trim() || "Anonymous";
  saveState(s);
  $("nickname").value=s.nickname;
  renderDashboard();
}

function start(mode){
  const s=getState();
  if(mode==="all") session=shuffle(bank);
  if(mode==="random20") session=shuffle(bank).slice(0,Math.min(20,bank.length));
  if(mode==="mistakes"){
    const ids=new Set(Object.keys(s.wrong||{}));
    session=shuffle(bank.filter(q=>ids.has(q.id)));
    if(!session.length){ alert("You have no saved mistakes to review yet."); return; }
  }
  currentMode=mode;
  current=0; sessionCorrect=0; locked=false; sessionAnswers=[];
  sessionStartedAt=Date.now(); sessionActiveSeconds=0; lastInteraction=Date.now();
  homeView.classList.add("hidden");
  resultView.classList.add("hidden");
  quizView.classList.remove("hidden");
  $("sessionMode").textContent=mode==="all"?"Full Chapter":mode==="random20"?"Random 20":"Mistake Review";
  startTimer();
  renderQuestion();
  window.scrollTo({top:0,behavior:"smooth"});
}

function startTimer(){
  clearInterval(timerHandle);
  timerHandle=setInterval(()=>{
    const active = !document.hidden && !quizView.classList.contains("hidden") && (Date.now()-lastInteraction)<60000;
    if(active){
      sessionActiveSeconds+=1;
      const s=getState();
      s.activeSeconds=(s.activeSeconds||0)+1;
      saveState(s);
      $("sessionTime").textContent=fmtClock(sessionActiveSeconds);
      $("liveTimePill").textContent=`⏱ ${fmtDuration(s.activeSeconds)} active`;
    }
  },1000);
}
function stopTimer(){ clearInterval(timerHandle); timerHandle=null; }

function renderQuestion(){
  locked=false;
  $("feedback").classList.add("hidden");
  $("next").classList.add("hidden");
  $("check").classList.remove("hidden");
  const q=session[current];
  $("progressText").textContent=`Question ${current+1} / ${session.length}`;
  $("progressBar").style.width=`${(current/session.length)*100}%`;
  $("question").textContent=q.question;
  $("questionType").textContent=q.type==="multi"?"Multiple answers":q.type==="tf"?"True / False":"Single choice";
  $("typeHint").textContent=q.type==="multi"?"Select all correct answers.":q.type==="tf"?"Choose whether the statement is true or false.":"Choose one answer.";
  $("sessionScore").textContent=`${sessionCorrect} / ${current}`;
  $("currentStreak").textContent=getState().currentStreak||0;

  const answers=$("answers");
  answers.innerHTML="";

  // Shuffle the visible answer positions every time the question is shown.
  // We keep each option's original index so correctness is still checked properly.
  const shuffledOptions = shuffle(
    q.options.map((text, originalIndex) => ({ text, originalIndex }))
  );

  shuffledOptions.forEach((item)=>{
    const label=document.createElement("label");
    label.className="answer";
    const input=document.createElement("input");
    input.type=q.type==="multi"?"checkbox":"radio";
    input.name="answer";
    input.value=item.originalIndex;
    input.dataset.originalIndex=item.originalIndex;
    const span=document.createElement("span");
    span.textContent=item.text;
    label.append(input,span);
    answers.appendChild(label);
  });
}

function selectedIndices(){
  return [...document.querySelectorAll("#answers input:checked")]
    .map(x=>Number(x.dataset.originalIndex ?? x.value))
    .sort((a,b)=>a-b);
}
function same(a,b){ return a.length===b.length && a.every((v,i)=>v===b[i]); }

function check(){
  if(locked) return;
  const q=session[current];
  const sel=selectedIndices();
  if(!sel.length){ alert("Choose an answer first."); return; }
  locked=true;
  const expected=[...q.answer].sort((a,b)=>a-b);
  const ok=same(sel,expected);
  if(ok) sessionCorrect++;

  const state=getState();
  state.seen[q.id]=(state.seen[q.id]||0)+1;
  state.totalAnswered=(state.totalAnswered||0)+1;
  if(ok){
    state.totalCorrect=(state.totalCorrect||0)+1;
    state.currentStreak=(state.currentStreak||0)+1;
    state.bestStreak=Math.max(state.bestStreak||0,state.currentStreak);
    delete state.wrong[q.id];
  } else {
    state.currentStreak=0;
    state.wrong[q.id]=(state.wrong[q.id]||0)+1;
  }
  saveState(state);
  sessionAnswers.push({q,ok,sel});

  document.querySelectorAll(".answer").forEach((el)=>{
    const input=el.querySelector("input");
    const originalIndex=Number(input.dataset.originalIndex ?? input.value);
    const isCorrect=expected.includes(originalIndex);
    const isSelected=sel.includes(originalIndex);
    if(isCorrect) el.classList.add("correct");
    else if(isSelected) el.classList.add("wrong");
    input.disabled=true;
  });

  $("feedback").textContent=(ok?"Nice — ":"Not quite — ")+q.explanation;
  $("feedback").classList.remove("hidden");
  $("check").classList.add("hidden");
  $("next").classList.remove("hidden");
  $("sessionScore").textContent=`${sessionCorrect} / ${current+1}`;
  $("currentStreak").textContent=state.currentStreak;
}

function next(){
  current++;
  if(current>=session.length){ finish(); return; }
  renderQuestion();
}

function finish(){
  stopTimer();
  quizView.classList.add("hidden");
  resultView.classList.remove("hidden");

  const pct=Math.round((sessionCorrect/session.length)*100);
  const state=getState();
  const nick=state.nickname || $("nickname").value.trim() || "Anonymous";
  state.nickname=nick;
  state.sessions=state.sessions||[];
  state.sessions.push({
    nickname:nick,
    correct:sessionCorrect,
    questions:session.length,
    percentage:pct,
    seconds:sessionActiveSeconds,
    date:new Date().toISOString(),
    mode:currentMode
  });
  state.sessions=state.sessions.slice(-100);
  saveState(state);

  submitGlobalResult({
    nickname:nick,
    correct:sessionCorrect,
    questions:session.length,
    percentage:pct,
    seconds:sessionActiveSeconds
  }).then(()=>loadGlobalLeaderboards());

  const ready=readiness(state);
  $("score").textContent=`${pct}%`;
  $("resultCorrect").textContent=sessionCorrect;
  $("resultQuestions").textContent=session.length;
  $("resultTime").textContent=fmtDuration(sessionActiveSeconds);
  $("resultReadiness").textContent=`${ready}%`;
  $("resultHeadline").textContent=pct>=90?"Excellent session!":pct>=75?"Strong work!":pct>=55?"Good progress!":"Keep building it!";
  $("resultSub").textContent=pct>=80
    ?"Your score is strong. Use the mistake review to make the remaining weak points stick."
    :"Review the missed questions, then try another session to consolidate the chapter.";

  $("resultDetails").innerHTML=sessionAnswers.map((r,i)=>`
    <div class="result-item ${r.ok?"":"bad"}">
      <strong>${i+1}. ${r.ok?"✓":"✗"} ${escapeHtml(r.q.question)}</strong>
      ${r.ok?"":`<div class="tiny muted" style="margin-top:5px">${escapeHtml(r.q.explanation)}</div>`}
    </div>`).join("");

  renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

function goHome(){
  stopTimer();
  quizView.classList.add("hidden");
  resultView.classList.add("hidden");
  homeView.classList.remove("hidden");
  renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>start(b.dataset.mode)));
$("saveNickname").addEventListener("click",saveNickname);
$("nickname").addEventListener("keydown",e=>{ if(e.key==="Enter") saveNickname(); });
$("check").addEventListener("click",check);
$("next").addEventListener("click",next);
$("backHome").addEventListener("click",goHome);
$("again").addEventListener("click",goHome);
$("brandHome").addEventListener("click",goHome);
$("retryMistakes").addEventListener("click",()=>start("mistakes"));
$("resetProgress").addEventListener("click",()=>{
  if(confirm("Reset all your saved quiz progress, study time and local session history?")){
    localStorage.removeItem("pcbQuizProgress");
    $("nickname").value="";
    renderDashboard();
  }
});
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) lastInteraction=Date.now(); });

init();
