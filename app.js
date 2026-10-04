const SUPABASE_URL = "https://jjrfduoqpaesnuzxomze.supabase.co";
const SUPABASE_KEY = "sb_publishable_1LVqf-8DBD49prvj7hGvDw_lTyA46PF";
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const CHAPTERS = [
  {
    id:"chapter1",
    number:"01",
    title:"Introduction to PCB Technology",
    subtitle:"FR-4 · mils · layers · parasitic capacitance · vias · Gerbers · HASL · ENIG",
    file:"chapter1.json"
  },
  {
    id:"chapter2",
    number:"02",
    title:"Soldering",
    subtitle:"wetting · flux · leaded/lead-free solder · cold joints · tip care · desoldering · reflow",
    file:"chapter2.json"
  }
];

let banks = {};
let allQuestions = [];
let session = [];
let current = 0;
let sessionCorrect = 0;
let locked = false;
let sessionAnswers = [];
let sessionActiveSeconds = 0;
let timerHandle = null;
let lastInteraction = Date.now();
let currentMode = "";
let currentScope = "chapter1";

const $ = id => document.getElementById(id);
const homeView = $("homeView");
const quizView = $("quizView");
const resultView = $("resultView");

const EMPTY_CHAPTER_STATE = () => ({
  seen:{},
  wrong:{},
  totalAnswered:0,
  totalCorrect:0
});

const DEFAULT_STATE = {
  version:2,
  nickname:"",
  activeSeconds:0,
  bestStreak:0,
  currentStreak:0,
  sessions:[],
  chapters:{}
};

function migrateState(raw){
  if(raw && raw.version===2){
    raw.chapters = raw.chapters || {};
    CHAPTERS.forEach(c=>{ raw.chapters[c.id] = {...EMPTY_CHAPTER_STATE(), ...(raw.chapters[c.id]||{})}; });
    raw.sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {...DEFAULT_STATE,...raw};
  }

  // Preserve progress from the old Chapter-1-only version.
  const migrated = {
    ...DEFAULT_STATE,
    nickname:raw?.nickname||"",
    activeSeconds:raw?.activeSeconds||0,
    bestStreak:raw?.bestStreak||0,
    currentStreak:raw?.currentStreak||0,
    sessions:(Array.isArray(raw?.sessions)?raw.sessions:[]).map(x=>({...x,scope:x.scope||"chapter1"})),
    chapters:{}
  };
  CHAPTERS.forEach(c=>migrated.chapters[c.id]=EMPTY_CHAPTER_STATE());
  migrated.chapters.chapter1 = {
    seen:raw?.seen||{},
    wrong:raw?.wrong||{},
    totalAnswered:raw?.totalAnswered||0,
    totalCorrect:raw?.totalCorrect||0
  };
  return migrated;
}

function getState(){
  let raw={};
  try{ raw=JSON.parse(localStorage.getItem("pcbQuizProgress") || "{}"); }catch(e){}
  return migrateState(raw);
}
function saveState(s){
  s.version=2;
  localStorage.setItem("pcbQuizProgress",JSON.stringify(s));
}

function chapterState(s,id){
  s.chapters=s.chapters||{};
  if(!s.chapters[id]) s.chapters[id]=EMPTY_CHAPTER_STATE();
  return s.chapters[id];
}
function questionKey(q){ return `${q.chapterId}:${q.id}`; }

function fmtDuration(sec){
  sec=Math.max(0,Math.round(sec||0));
  if(sec<60) return `${sec}s`;
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);
  return h?`${h}h ${m}m`:`${m}m`;
}
function fmtClock(sec){
  sec=Math.max(0,Math.round(sec||0));
  const m=Math.floor(sec/60),s=sec%60;
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
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function seenCount(cs){ return Object.keys(cs.seen||{}).length; }
function wrongCount(cs){ return Object.keys(cs.wrong||{}).length; }
function masteredCount(cs){ return Math.max(0,seenCount(cs)-wrongCount(cs)); }
function chapterAccuracy(cs){ return cs.totalAnswered?cs.totalCorrect/cs.totalAnswered:0; }
function chapterCoverage(s,id){
  const n=(banks[id]||[]).length;
  return n?seenCount(chapterState(s,id))/n:0;
}
function chapterMastery(s,id){
  const n=(banks[id]||[]).length;
  return n?masteredCount(chapterState(s,id))/n:0;
}
function chapterReadiness(s,id){
  const cs=chapterState(s,id);
  const n=(banks[id]||[]).length;
  if(!cs.totalAnswered||!n) return 0;
  const acc=chapterAccuracy(cs),cov=chapterCoverage(s,id),mas=chapterMastery(s,id);
  const consistency=Math.min(1,cs.totalAnswered/Math.max(20,n));
  return Math.round(100*(.45*acc+.25*cov+.20*mas+.10*consistency));
}
function overallStats(s){
  let answered=0,correct=0,seen=0,wrong=0,total=0,mastered=0;
  CHAPTERS.forEach(c=>{
    const cs=chapterState(s,c.id);
    answered+=cs.totalAnswered||0;
    correct+=cs.totalCorrect||0;
    seen+=seenCount(cs);
    wrong+=wrongCount(cs);
    total+=(banks[c.id]||[]).length;
    mastered+=masteredCount(cs);
  });
  const acc=answered?correct/answered:0;
  const cov=total?seen/total:0;
  const mas=total?mastered/total:0;
  const consistency=Math.min(1,answered/Math.max(40,total));
  const ready=answered?Math.round(100*(.45*acc+.25*cov+.20*mas+.10*consistency)):0;
  return {answered,correct,seen,wrong,total,mastered,acc,cov,mas,ready};
}
function readinessCopy(v){
  if(v<25) return ["Start practising","You are building your first revision baseline."];
  if(v<50) return ["Keep practising","You have started covering the course, but there is still a lot to consolidate."];
  if(v<70) return ["Getting there","Your foundations are developing. Keep reviewing missed questions."];
  if(v<85) return ["Good progress","You are showing solid quiz performance with useful course coverage."];
  if(v<95) return ["Very well prepared","Your practice results are strong. Keep checking weak spots."];
  return ["Excellent mastery","Your quiz results show very strong coverage and accuracy."];
}

async function loadChapter(ch){
  try{
    const res=await fetch(ch.file,{cache:"no-store"});
    if(!res.ok) throw new Error(`${res.status}`);
    const data=await res.json();
    if(!Array.isArray(data.questions)) throw new Error("Invalid question file");
    return data.questions.map(q=>({...q,chapterId:ch.id,chapterTitle:ch.title}));
  }catch(err){
    console.error(`Could not load ${ch.file}`,err);
    return [];
  }
}

async function init(){
  const loaded=await Promise.all(CHAPTERS.map(loadChapter));
  CHAPTERS.forEach((c,i)=>banks[c.id]=loaded[i]);
  allQuestions=CHAPTERS.flatMap(c=>banks[c.id]||[]);

  if(!allQuestions.length){
    alert("No question bank could be loaded.");
    return;
  }

  const s=getState();
  saveState(s); // saves migrated structure
  $("nickname").value=s.nickname||"";
  renderChapterCards();
  renderDashboard();
  bindActivityTracking();

  $("leaderboardScope").addEventListener("change",()=>loadGlobalLeaderboards());
  document.querySelectorAll("[data-exam-mode]").forEach(b=>b.addEventListener("click",()=>startExam(b.dataset.examMode)));
}

function renderChapterCards(){
  $("chapterList").innerHTML=CHAPTERS.map(ch=>{
    const count=(banks[ch.id]||[]).length;
    return `
      <section class="chapter-card card">
        <div class="chapter-number">${ch.number}</div>
        <div class="chapter-main">
          <div class="chapter-title-row">
            <div>
              <h3>${escapeHtml(ch.title)}</h3>
              <p>${escapeHtml(ch.subtitle)}</p>
            </div>
            <span class="question-count">${count} questions</span>
          </div>
          <div class="chapter-progress">
            <div class="progress-labels">
              <span>Chapter coverage</span>
              <strong id="${ch.id}CoverageText">0%</strong>
            </div>
            <div class="progress-track"><div id="${ch.id}CoverageBar" class="progress-fill"></div></div>
          </div>
          <div class="chapter-actions">
            <button class="btn" data-chapter="${ch.id}" data-mode="all">Study all questions</button>
            <button class="btn btn-secondary" data-chapter="${ch.id}" data-mode="random20">20 random questions</button>
            <button class="btn btn-soft" data-chapter="${ch.id}" data-mode="mistakes">
              Review mistakes <span id="${ch.id}MistakeBadge" class="badge">0</span>
            </button>
          </div>
        </div>
      </section>`;
  }).join("");

  document.querySelectorAll("[data-chapter][data-mode]").forEach(b=>{
    b.addEventListener("click",()=>startChapter(b.dataset.chapter,b.dataset.mode));
  });
}

function renderDashboard(){
  const s=getState();
  const o=overallStats(s);
  const [label,txt]=readinessCopy(o.ready);

  $("accuracyStat").textContent=o.answered?`${Math.round(o.acc*100)}%`:"—";
  $("accuracyCaption").textContent=o.answered?`${o.correct} correct / ${o.answered} answered`:"No answers yet";
  $("coverageStat").textContent=`${Math.round(o.cov*100)}%`;
  $("coverageCaption").textContent=`${o.seen} / ${o.total} questions seen`;
  $("studyTimeStat").textContent=fmtDuration(s.activeSeconds);
  $("streakStat").textContent=s.bestStreak||0;
  $("readinessValue").textContent=`${o.ready}%`;
  $("readinessLabel").textContent=label;
  $("readinessText").textContent=txt;
  $("readinessRing").style.setProperty("--p",o.ready);
  $("liveTimePill").textContent=`⏱ ${fmtDuration(s.activeSeconds)} active`;
  $("allMistakeBadge").textContent=o.wrong;
  $("examBankInfo").textContent=`${CHAPTERS.length} chapters · ${o.total} questions currently available`;

  CHAPTERS.forEach(ch=>{
    const cs=chapterState(s,ch.id);
    const cov=Math.round(chapterCoverage(s,ch.id)*100);
    $(`${ch.id}CoverageText`).textContent=`${cov}%`;
    $(`${ch.id}CoverageBar`).style.width=`${cov}%`;
    $(`${ch.id}MistakeBadge`).textContent=wrongCount(cs);
  });

  $("progressBreakdown").innerHTML=CHAPTERS.map(ch=>{
    const cs=chapterState(s,ch.id);
    const ready=chapterReadiness(s,ch.id);
    const cov=Math.round(chapterCoverage(s,ch.id)*100);
    const acc=cs.totalAnswered?Math.round(chapterAccuracy(cs)*100):0;
    return `
      <div class="breakdown-row">
        <div class="row-top"><span>${escapeHtml(ch.number+" · "+ch.title)}</span><strong>${ready}% ready</strong></div>
        <div class="tiny muted" style="margin-bottom:7px">${acc}% accuracy · ${cov}% coverage · ${wrongCount(cs)} mistake${wrongCount(cs)===1?"":"s"}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${ready}%"></div></div>
      </div>`;
  }).join("");

  renderLocalFallbackLeaderboards(s);
  loadGlobalLeaderboards();
}

function saveNickname(){
  const s=getState();
  s.nickname=$("nickname").value.trim()||"Anonymous";
  saveState(s);
  $("nickname").value=s.nickname;
  renderDashboard();
}

function idsForMistakes(s,chapterId=null){
  if(chapterId){
    const cs=chapterState(s,chapterId);
    return new Set(Object.keys(cs.wrong||{}).map(id=>`${chapterId}:${id}`));
  }
  const ids=new Set();
  CHAPTERS.forEach(ch=>{
    Object.keys(chapterState(s,ch.id).wrong||{}).forEach(id=>ids.add(`${ch.id}:${id}`));
  });
  return ids;
}

function startChapter(chapterId,mode){
  const bank=banks[chapterId]||[];
  const s=getState();
  let chosen=[];
  if(mode==="all") chosen=shuffle(bank);
  if(mode==="random20") chosen=shuffle(bank).slice(0,Math.min(20,bank.length));
  if(mode==="mistakes"){
    const ids=idsForMistakes(s,chapterId);
    chosen=shuffle(bank.filter(q=>ids.has(questionKey(q))));
    if(!chosen.length){ alert("You have no saved mistakes for this chapter yet."); return; }
  }
  currentScope=chapterId;
  beginSession(chosen,mode);
}

function createBalancedExam(n=40){
  const nonEmpty=CHAPTERS.filter(ch=>(banks[ch.id]||[]).length);
  if(!nonEmpty.length) return [];
  const pools=Object.fromEntries(nonEmpty.map(ch=>[ch.id,shuffle(banks[ch.id])]));
  const chosen=[];
  let index=0;
  while(chosen.length<n){
    const ch=nonEmpty[index%nonEmpty.length];
    if(pools[ch.id].length) chosen.push(pools[ch.id].pop());
    if(nonEmpty.every(c=>!pools[c.id].length)) break;
    index++;
  }
  return shuffle(chosen);
}

function startExam(mode){
  const s=getState();
  let chosen=[];
  if(mode==="mock40") chosen=createBalancedExam(40);
  if(mode==="mixedAll") chosen=shuffle(allQuestions);
  if(mode==="mistakesAll"){
    const ids=idsForMistakes(s);
    chosen=shuffle(allQuestions.filter(q=>ids.has(questionKey(q))));
    if(!chosen.length){ alert("You have no saved mistakes across the chapters yet."); return; }
  }
  currentScope="exam";
  beginSession(chosen,mode);
}

function beginSession(chosen,mode){
  if(!chosen.length){ alert("No questions are available for this mode."); return; }
  session=chosen;
  currentMode=mode;
  current=0; sessionCorrect=0; locked=false; sessionAnswers=[];
  sessionActiveSeconds=0; lastInteraction=Date.now();
  homeView.classList.add("hidden");
  resultView.classList.add("hidden");
  quizView.classList.remove("hidden");

  const scopeName=currentScope==="exam"
    ?"Mock Exam"
    :(CHAPTERS.find(c=>c.id===currentScope)?.title||"Chapter");
  const modeName={
    all:"Full chapter",
    random20:"Random 20",
    mistakes:"Mistake review",
    mock40:"40-question mock exam",
    mixedAll:"All chapters mixed",
    mistakesAll:"All mistakes"
  }[mode]||"Quiz";
  $("sessionMode").textContent=`${scopeName} · ${modeName}`;
  $("sessionTime").textContent="0:00";
  startTimer();
  renderQuestion();
  window.scrollTo({top:0,behavior:"smooth"});
}

function bindActivityTracking(){
  ["click","keydown","touchstart"].forEach(evt=>{
    window.addEventListener(evt,()=>{lastInteraction=Date.now();},{passive:true});
  });
}

function startTimer(){
  clearInterval(timerHandle);
  timerHandle=setInterval(()=>{
    const active=!document.hidden&&!quizView.classList.contains("hidden")&&(Date.now()-lastInteraction)<60000;
    if(active){
      sessionActiveSeconds++;
      const s=getState();
      s.activeSeconds=(s.activeSeconds||0)+1;
      saveState(s);
      $("sessionTime").textContent=fmtClock(sessionActiveSeconds);
      $("liveTimePill").textContent=`⏱ ${fmtDuration(s.activeSeconds)} active`;
    }
  },1000);
}
function stopTimer(){clearInterval(timerHandle);timerHandle=null;}

function renderQuestion(){
  locked=false;
  $("feedback").classList.add("hidden");
  $("next").classList.add("hidden");
  $("check").classList.remove("hidden");
  const q=session[current];

  $("progressText").textContent=`Question ${current+1} / ${session.length}`;
  $("progressBar").style.width=`${(current/session.length)*100}%`;
  $("question").textContent=q.question;

  const typeText=q.type==="multi"?"Multiple answers":q.type==="tf"?"True / False":"Single choice";
  $("questionType").textContent=currentScope==="exam"?typeText:`${q.chapterTitle} · ${typeText}`;
  $("typeHint").textContent=q.type==="multi"?"Select all correct answers.":q.type==="tf"?"Choose whether the statement is true or false.":"Choose one answer.";
  $("sessionScore").textContent=`${sessionCorrect} / ${current}`;
  $("currentStreak").textContent=getState().currentStreak||0;

  const answers=$("answers");
  answers.innerHTML="";
  const shuffledOptions=shuffle(q.options.map((text,originalIndex)=>({text,originalIndex})));
  shuffledOptions.forEach(item=>{
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
    .map(x=>Number(x.dataset.originalIndex??x.value))
    .sort((a,b)=>a-b);
}
function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}

function check(){
  if(locked) return;
  const q=session[current];
  const sel=selectedIndices();
  if(!sel.length){alert("Choose an answer first.");return;}
  locked=true;

  const expected=[...q.answer].sort((a,b)=>a-b);
  const ok=same(sel,expected);
  if(ok) sessionCorrect++;

  const state=getState();
  const cs=chapterState(state,q.chapterId);
  cs.seen[q.id]=(cs.seen[q.id]||0)+1;
  cs.totalAnswered=(cs.totalAnswered||0)+1;

  if(ok){
    cs.totalCorrect=(cs.totalCorrect||0)+1;
    state.currentStreak=(state.currentStreak||0)+1;
    state.bestStreak=Math.max(state.bestStreak||0,state.currentStreak);
    delete cs.wrong[q.id];
  }else{
    state.currentStreak=0;
    cs.wrong[q.id]=(cs.wrong[q.id]||0)+1;
  }
  saveState(state);
  sessionAnswers.push({q,ok,sel});

  document.querySelectorAll(".answer").forEach(el=>{
    const input=el.querySelector("input");
    const originalIndex=Number(input.dataset.originalIndex??input.value);
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
  if(current>=session.length){finish();return;}
  renderQuestion();
}

async function submitGlobalResult(result){
  if(!supabaseClient) return;
  try{
    const {error}=await supabaseClient.from("quiz_results").insert({
      nickname:result.nickname,
      chapter:result.scope,
      score:result.correct,
      total_questions:result.questions,
      percentage:result.percentage,
      active_seconds:result.seconds
    });
    if(error) console.error("Supabase insert error:",error);
  }catch(err){
    console.error("Could not submit global result:",err);
  }
}

function finish(){
  stopTimer();
  quizView.classList.add("hidden");
  resultView.classList.remove("hidden");

  const pct=Math.round((sessionCorrect/session.length)*100);
  const state=getState();
  const nick=state.nickname||$("nickname").value.trim()||"Anonymous";
  state.nickname=nick;
  state.sessions=state.sessions||[];
  state.sessions.push({
    nickname:nick,
    correct:sessionCorrect,
    questions:session.length,
    percentage:pct,
    seconds:sessionActiveSeconds,
    date:new Date().toISOString(),
    mode:currentMode,
    scope:currentScope
  });
  state.sessions=state.sessions.slice(-200);
  saveState(state);

  submitGlobalResult({
    nickname:nick,
    correct:sessionCorrect,
    questions:session.length,
    percentage:pct,
    seconds:sessionActiveSeconds,
    scope:currentScope
  }).then(()=>loadGlobalLeaderboards());

  const ready=currentScope==="exam"?overallStats(state).ready:chapterReadiness(state,currentScope);
  $("score").textContent=`${pct}%`;
  $("resultCorrect").textContent=sessionCorrect;
  $("resultQuestions").textContent=session.length;
  $("resultTime").textContent=fmtDuration(sessionActiveSeconds);
  $("resultReadiness").textContent=`${ready}%`;
  $("resultHeadline").textContent=pct>=90?"Excellent session!":pct>=75?"Strong work!":pct>=55?"Good progress!":"Keep building it!";
  $("resultSub").textContent=currentScope==="exam"
    ? "This mixed result gives you a broader view across the chapters. Review the missed questions, then try another mock exam."
    : "Use the mistake review to consolidate the weak points in this chapter.";

  $("resultDetails").innerHTML=sessionAnswers.map((r,i)=>`
    <div class="result-item ${r.ok?"":"bad"}">
      <strong>${i+1}. ${r.ok?"✓":"✗"} ${escapeHtml(r.q.question)}</strong>
      <div class="tiny muted" style="margin-top:5px">${escapeHtml(r.q.chapterTitle)}${r.ok?"":" · "+escapeHtml(r.q.explanation)}</div>
    </div>`).join("");

  renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderLocalFallbackLeaderboards(s){
  const scope=$("leaderboardScope")?.value||"exam";
  const sessions=(s.sessions||[]).filter(x=>(x.scope||"chapter1")===scope);
  const scoreEl=$("scoreLeaderboard");
  if(!sessions.length){
    scoreEl.innerHTML='<div class="empty-state">No local results for this mode yet.</div>';
  }else{
    const bestByName={};
    sessions.forEach(x=>{
      const n=x.nickname||"Anonymous";
      const p=bestByName[n];
      if(!p||x.percentage>p.percentage||(x.percentage===p.percentage&&x.questions>p.questions)) bestByName[n]=x;
    });
    const ranked=Object.entries(bestByName).map(([nickname,x])=>({nickname,...x}))
      .sort((a,b)=>b.percentage-a.percentage||b.questions-a.questions).slice(0,5);
    scoreEl.innerHTML=ranked.map((x,i)=>`
      <div class="leader-row"><div class="rank ${i===0?"top":""}">${i+1}</div>
      <div><div class="leader-name">${escapeHtml(x.nickname)}</div><div class="leader-meta">${x.correct}/${x.questions} · local fallback</div></div>
      <div class="leader-score">${x.percentage}%</div></div>`).join("");
  }

  const totals={};
  sessions.forEach(x=>{
    const n=x.nickname||"Anonymous";
    if(!totals[n])totals[n]={seconds:0,sessions:0};
    totals[n].seconds+=x.seconds||0;totals[n].sessions++;
  });
  const tr=Object.entries(totals).sort((a,b)=>b[1].seconds-a[1].seconds).slice(0,5);
  $("timeLeaderboard").innerHTML=tr.length?tr.map(([n,v],i)=>`
    <div class="leader-row"><div class="rank ${i===0?"top":""}">${i+1}</div>
    <div><div class="leader-name">${escapeHtml(n)}</div><div class="leader-meta">${v.sessions} session${v.sessions===1?"":"s"}</div></div>
    <div class="leader-score">${fmtDuration(v.seconds)}</div></div>`).join("")
    :'<div class="empty-state">No study-time results for this mode yet.</div>';
}

async function loadGlobalLeaderboards(){
  const scope=$("leaderboardScope")?.value||"exam";
  const state=getState();
  renderLocalFallbackLeaderboards(state);
  if(!supabaseClient) return;

  try{
    const {data,error}=await supabaseClient
      .from("quiz_results")
      .select("nickname,score,total_questions,percentage,active_seconds,created_at")
      .eq("chapter",scope)
      .order("created_at",{ascending:false})
      .limit(1000);
    if(error) throw error;
    const rows=Array.isArray(data)?data:[];

    const bestByName={};
    rows.forEach(r=>{
      const name=(r.nickname||"Anonymous").trim()||"Anonymous";
      const prev=bestByName[name];
      if(!prev||r.percentage>prev.percentage||
         (r.percentage===prev.percentage&&r.total_questions>prev.total_questions)||
         (r.percentage===prev.percentage&&r.total_questions===prev.total_questions&&new Date(r.created_at)>new Date(prev.created_at))){
        bestByName[name]=r;
      }
    });
    const best=Object.entries(bestByName).map(([nickname,r])=>({nickname,...r}))
      .sort((a,b)=>b.percentage-a.percentage||b.total_questions-a.total_questions||b.score-a.score).slice(0,10);

    $("scoreLeaderboard").innerHTML=best.length?best.map((x,i)=>`
      <div class="leader-row"><div class="rank ${i===0?"top":""}">${i+1}</div>
      <div><div class="leader-name">${escapeHtml(x.nickname)}</div><div class="leader-meta">${x.score}/${x.total_questions} · best submitted result</div></div>
      <div class="leader-score">${x.percentage}%</div></div>`).join("")
      :'<div class="empty-state">No global scores for this mode yet. Be the first!</div>';

    const timeByName={};
    rows.forEach(r=>{
      const name=(r.nickname||"Anonymous").trim()||"Anonymous";
      if(!timeByName[name])timeByName[name]={seconds:0,sessions:0,questions:0};
      timeByName[name].seconds+=Number(r.active_seconds)||0;
      timeByName[name].sessions++;
      timeByName[name].questions+=Number(r.total_questions)||0;
    });
    const timeRows=Object.entries(timeByName).map(([nickname,v])=>({nickname,...v}))
      .sort((a,b)=>b.seconds-a.seconds).slice(0,10);

    $("timeLeaderboard").innerHTML=timeRows.length?timeRows.map((x,i)=>`
      <div class="leader-row"><div class="rank ${i===0?"top":""}">${i+1}</div>
      <div><div class="leader-name">${escapeHtml(x.nickname)}</div><div class="leader-meta">${x.sessions} session${x.sessions===1?"":"s"} · ${x.questions} questions</div></div>
      <div class="leader-score">${fmtDuration(x.seconds)}</div></div>`).join("")
      :'<div class="empty-state">No global study-time data for this mode yet.</div>';
  }catch(err){
    console.error("Could not load global leaderboards:",err);
  }
}

function goHome(){
  stopTimer();
  quizView.classList.add("hidden");
  resultView.classList.add("hidden");
  homeView.classList.remove("hidden");
  renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

$("saveNickname").addEventListener("click",saveNickname);
$("nickname").addEventListener("keydown",e=>{if(e.key==="Enter")saveNickname();});
$("check").addEventListener("click",check);
$("next").addEventListener("click",next);
$("backHome").addEventListener("click",goHome);
$("again").addEventListener("click",goHome);
$("brandHome").addEventListener("click",goHome);
$("retryMistakes").addEventListener("click",()=>{
  if(currentScope==="exam") startExam("mistakesAll");
  else startChapter(currentScope,"mistakes");
});
$("resetProgress").addEventListener("click",()=>{
  if(confirm("Reset all your saved quiz progress, study time and local session history?")){
    localStorage.removeItem("pcbQuizProgress");
    $("nickname").value="";
    renderDashboard();
  }
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)lastInteraction=Date.now();});

init();
