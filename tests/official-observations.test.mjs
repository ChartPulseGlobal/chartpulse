import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const ROOT=process.cwd(), FILE=path.join(ROOT,"public","data","official-national-observations.json");
const data=JSON.parse(fs.readFileSync(FILE,"utf8"));
function pearson(xs,ys){const n=xs.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let num=0,dx2=0,dy2=0;for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;num+=dx*dy;dx2+=dx*dx;dy2+=dy*dy}return num/Math.sqrt(dx2*dy2)}
function ranks(v){const s=v.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value),out=new Array(v.length);let i=0;while(i<s.length){let j=i+1;while(j<s.length&&s[j].value===s[i].value)j++;const r=(i+1+j)/2;for(let k=i;k<j;k++)out[s[k].index]=r;i=j}return out}
function spearman(a,b){return pearson(ranks(a),ranks(b))}
test("official compact dataset exists and is non-synthetic",()=>{assert.ok(fs.existsSync(FILE));assert.equal(data.meta.synthetic,false);assert.match(data.meta.generatedAtUtc,/^\d{4}-\d{2}-\d{2}T/)});
test("INSEE 2025 official control values",()=>{assert.equal(data.insee.year,2025);assert.equal(data.insee.observations.length,3);const x=data.insee.observations.find(r=>r.group==="Immigrés");assert.ok(x);assert.equal(x.employmentRate,61.9);assert.equal(x.unemploymentRate,12.4);assert.equal(x.activityRate,70.7)});
test("SSMSI series cover 2016-2025",()=>{for(let y=2016;y<=2025;y++)assert.ok(data.ssmsi.years.includes(y),`missing ${y}`);assert.ok(data.ssmsi.indicators.victimes.length>=10);assert.ok(data.ssmsi.indicators.mis_en_cause.length>=10);assert.ok(data.quality.observationCount>100)});
test("no negative counts",()=>{for(const r of data.ssmsi.observations)if(r.value!==null)assert.ok(r.value>=0,JSON.stringify(r))});
test("secret cells remain null, never zero",()=>{const rows=data.ssmsi.observations.filter(r=>r.secret);assert.ok(rows.length>0);for(const r of rows)assert.equal(r.value,null)});
test("nationality margins reconcile",()=>assert.equal(data.quality.reconciliationIssueCount,0,JSON.stringify(data.quality.reconciliationIssues)));
test("secret nationality cell blocks a share",()=>{const s=data.ssmsi.annualTotals.find(r=>r.secret&&["Française","Étrangère"].includes(r.nationality));if(!s)return;const a=data.ssmsi.annualTotals.filter(r=>r.role===s.role&&r.indicator===s.indicator&&r.year===s.year),f=a.find(r=>r.nationality==="Française"),e=a.find(r=>r.nationality==="Étrangère");assert.ok(!f||!e||f.secret||e.secret||f.value===null||e.value===null)});
test("Pearson and Spearman formulas",()=>{assert.ok(Math.abs(pearson([1,2,3,4],[2,4,6,8])-1)<1e-12);assert.ok(Math.abs(spearman([1,2,3,4],[8,6,4,2])+1)<1e-12)});
test("no municipal workflow in active app",()=>{const files=["app/page.tsx","components/national/NationalWorkbench.tsx","components/national/ObservableNationalViews.tsx","lib/national/official-data.ts"];const content=files.map(f=>fs.readFileSync(path.join(ROOT,f),"utf8")).join("\n").toLowerCase();assert.doesNotMatch(content,/comparateur de communes|epci|carte territoriale|logique communale/)});
test("primary sources are official",()=>{for(const s of Object.values(data.sources))assert.ok(s.url.includes("insee.fr")||s.url.includes("data.gouv.fr"),s.url)});
