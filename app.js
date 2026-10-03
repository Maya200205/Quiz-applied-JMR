let bank = [];
let session = [];
let current = 0;
let correct = 0;
let locked = false;
let sessionAnswers = [];

const $ = (id) => document.getElementById(id);
const home = $("home"), quiz = $("quiz"), result = $("result");

function getState(){
  return JSON.parse(localStorage.getItem("pcbQuizProgress") || '{"seen":{},"wrong":{}}');
}
function saveState(s){ localStorage.setItem("pcbQuizProgress", JSON.stringify(s)); }

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

async function init(){
  const res = await fetch("data/chapter1.json");
  const data = await res.json();
  bank = data.questions;
  renderStats();
}
function renderStats(){
  const s=getState();
  const seen=Object.keys(s.seen||{}).length;
  const wrong=Object.keys(s.wrong||{}).length;
  $("stats").textContent = `${bank.length} questions in Chapter 1 · ${seen} seen · ${wrong} currently marked for review`;
}

function start(mode){
  const s=getState();
  if(mode==="all") session=shuffle(bank);
  if(mode==="random20") session=shuffle(bank).slice(0,20);
  if(mode==="mistakes"){
    const ids=new Set(Object.keys(s.wrong||{}));
    session=shuffle(bank.filter(q=>ids.has(q.id)));
    if(!session.length){ alert("No mistakes saved yet."); return; }
  }
  current=0; correct=0; locked=false; sessionAnswers=[];
  home.classList.add("hidden"); result.classList.add("hidden"); quiz.classList.remove("hidden");
  renderQuestion();
}

function renderQuestion(){
  locked=false;
  $("feedback").classList.add("hidden");
  $("next").classList.add("hidden");
  $("check").classList.remove("hidden");
  const q=session[current];
  $("progressText").textContent=`Question ${current+1} / ${session.length}`;
  $("progressBar").style.width=`${(current/session.length)*100}%`;
  $("question").textContent=q.question;
  $("typeHint").textContent = q.type==="multi" ? "Select all correct answers." : q.type==="tf" ? "True or false." : "Choose one answer.";

  const answers=$("answers");
  answers.innerHTML="";
  q.options.forEach((opt,idx)=>{
    const label=document.createElement("label");
    label.className="answer";
    const input=document.createElement("input");
    input.type=q.type==="multi" ? "checkbox" : "radio";
    input.name="answer";
    input.value=idx;
    const span=document.createElement("span");
    span.textContent=opt;
    label.append(input,span);
    answers.appendChild(label);
  });
}

function selectedIndices(){
  return [...document.querySelectorAll('#answers input:checked')].map(x=>Number(x.value)).sort((a,b)=>a-b);
}
function same(a,b){ return a.length===b.length && a.every((v,i)=>v===b[i]); }

function check(){
  if(locked) return;
  const q=session[current];
  const sel=selectedIndices();
  if(!sel.length){ alert("Choose an answer first."); return; }
  locked=true;
  const ok=same(sel,[...q.answer].sort((a,b)=>a-b));
  if(ok) correct++;

  const state=getState();
  state.seen[q.id]=(state.seen[q.id]||0)+1;
  if(ok) delete state.wrong[q.id];
  else state.wrong[q.id]=(state.wrong[q.id]||0)+1;
  saveState(state);

  sessionAnswers.push({q,ok,sel});

  document.querySelectorAll(".answer").forEach((el,idx)=>{
    const isCorrect=q.answer.includes(idx);
    const isSelected=sel.includes(idx);
    if(isCorrect) el.classList.add("correct");
    else if(isSelected) el.classList.add("wrong");
    el.querySelector("input").disabled=true;
  });

  $("feedback").textContent=(ok ? "Correct. " : "Not quite. ") + q.explanation;
  $("feedback").classList.remove("hidden");
  $("check").classList.add("hidden");
  $("next").classList.remove("hidden");
}

function next(){
  current++;
  if(current>=session.length){ finish(); return; }
  renderQuestion();
}

function finish(){
  quiz.classList.add("hidden");
  result.classList.remove("hidden");
  const pct=Math.round((correct/session.length)*100);
  $("score").textContent=`${correct} / ${session.length} (${pct}%)`;
  $("progressBar").style.width="100%";

  const list=document.createElement("div");
  list.className="result-list";
  sessionAnswers.forEach((r,i)=>{
    const d=document.createElement("div");
    d.className="result-item"+(r.ok?"":" bad");
    d.textContent=`${i+1}. ${r.ok ? "✓" : "✗"} ${r.q.question}`;
    list.appendChild(d);
  });
  $("resultDetails").innerHTML="";
  $("resultDetails").appendChild(list);
  renderStats();
}

document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>start(b.dataset.mode)));
$("check").addEventListener("click",check);
$("next").addEventListener("click",next);
$("back").addEventListener("click",()=>{quiz.classList.add("hidden");home.classList.remove("hidden");renderStats();});
$("again").addEventListener("click",()=>{result.classList.add("hidden");home.classList.remove("hidden");renderStats();});
$("resetProgress").addEventListener("click",()=>{
  if(confirm("Reset all saved progress and mistakes?")){
    localStorage.removeItem("pcbQuizProgress");
    renderStats();
  }
});
init();
