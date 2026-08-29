#!/usr/bin/env python3
"""Rebuild Laboratoire INSEE from official INSEE and SSMSI sources only."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, html, json, math, os, re, tempfile, unicodedata, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"public"/"data"/"official-national-observations.json"
CACHE=ROOT/".cache"/"official-sources"
INSEE_CONTROL="https://www.insee.fr/fr/statistiques/4195420"
INSEE_ANNUEL="https://api.insee.fr/melodi/data/DD_EEC_ANNUEL"
INSEE_SERIES="https://api.insee.fr/melodi/data/DD_EEC_SERIES"
SSMSI_VICTIMS="https://www.data.gouv.fr/api/1/datasets/r/80756b55-7c13-4609-80f6-a6655d228c6f"
SSMSI_SUSPECTS="https://www.data.gouv.fr/api/1/datasets/r/dedf224c-b2a3-4f27-a4d2-7de4108ae29d"
SSMSI_PAGE="https://www.data.gouv.fr/datasets/principales-caracteristiques-des-victimes-enregistrees-et-des-mis-en-cause-pour-des-infractions-elucidees-par-la-police-et-la-gendarmerie-nationales"
JUSTICE_PAGE="https://www.data.gouv.fr/datasets/les-condamnations-statistiques-a-partir-du-casier-judiciaire-national"
UA="Laboratoire-INSEE-reproducible-build/1.0 (+https://github.com/ChartPulseGlobal/chartpulse)"

def norm(v:Any)->str:
    s=unicodedata.normalize("NFKD",str(v or "").strip().lower())
    s="".join(c for c in s if not unicodedata.combining(c)).replace("’","'").replace("–","-").replace("—","-")
    return re.sub(r"\s+"," ",s)

def number(v:Any):
    if v is None:return None
    if isinstance(v,(int,float)) and not isinstance(v,bool):
        if isinstance(v,float) and math.isnan(v):return None
        return int(v) if float(v).is_integer() else float(v)
    s=str(v).strip().replace("\u202f","").replace("\xa0","").replace(" ","")
    if not s or norm(s).startswith("secr"):return None
    try:
        x=float(s.replace(",",".")); return int(x) if x.is_integer() else x
    except ValueError:return None

def request(url:str,accept:str|None=None,timeout:int=90)->bytes:
    headers={"User-Agent":UA}
    if accept:headers["Accept"]=accept
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=timeout) as r:return r.read()

def download(url:str,name:str,force=False):
    CACHE.mkdir(parents=True,exist_ok=True); p=CACHE/name
    if force or not p.exists() or p.stat().st_size==0:
        data=request(url); tmp=p.with_suffix(p.suffix+".tmp"); tmp.write_bytes(data); tmp.replace(p)
    return p,hashlib.sha256(p.read_bytes()).hexdigest()

class Tables(HTMLParser):
    def __init__(self):super().__init__();self.row=[];self.rows=[];self.cell=[];self.inrow=False;self.incell=False
    def handle_starttag(self,tag,attrs):
        if tag=="tr":self.inrow=True;self.row=[]
        elif tag in {"td","th"} and self.inrow:self.incell=True;self.cell=[]
        elif tag=="br" and self.incell:self.cell.append(" ")
    def handle_data(self,data):
        if self.incell:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in {"td","th"} and self.incell:
            self.row.append(re.sub(r"\s+"," ",html.unescape(" ".join(self.cell))).strip());self.incell=False
        elif tag=="tr" and self.inrow:
            if self.row:self.rows.append(self.row[:])
            self.inrow=False

def insee(force=False):
    CACHE.mkdir(parents=True,exist_ok=True); p=CACHE/"insee-4195420.html"
    if force or not p.exists():p.write_bytes(request(INSEE_CONTROL,"text/html"))
    parser=Tables();parser.feed(p.read_text("utf-8",errors="replace")); found={}
    labels={"immigres":"Immigrés","descendants":"Descendants d’immigrés","sans":"Sans ascendance migratoire directe"}
    for row in parser.rows:
        if not row:continue
        first=norm(row[0]); key=None
        if "ensemble des immigres" in first and "descendant" not in first:key="immigres"
        elif "ensemble des descendants d'immigres" in first:key="descendants"
        elif "personnes sans ascendance migratoire" in first:key="sans"
        if not key or key in found:continue
        nums=[float(x) for x in (number(v) for v in row[1:]) if x is not None]
        if len(nums)>=5:
            inactivity,employment,unemployment=nums[-3:]
            found[key]={"year":2025,"group":labels[key],"employmentRate":employment,"activityRate":round(100-inactivity,1),"unemploymentRate":unemployment,"inactivityRate":inactivity,"unit":"%","age":"15-64 ans","field":"France hors Mayotte, personnes vivant dans un logement ordinaire","definition":"BIT","source":"Insee, enquête Emploi","sourceUrl":INSEE_CONTROL}
    if set(found)!={"immigres","descendants","sans"}:raise RuntimeError(f"Extraction INSEE incomplète: {sorted(found)}")
    rows=[found[k] for k in ("immigres","descendants","sans")]
    return rows,{"url":INSEE_CONTROL,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"tableRowsSeen":len(parser.rows)}

def extract_records(obj:Any):
    best=[]
    def visit(x):
        nonlocal best
        if isinstance(x,list):
            ds=[v for v in x if isinstance(v,dict)]
            if len(ds)>len(best) and any("TIME_PERIOD" in d for d in ds[:20]):best=ds
            for v in x[:30]:visit(v)
        elif isinstance(x,dict):
            for v in x.values():visit(v)
    visit(obj);return best

def melodi(url,year=None):
    q={"maxResult":"100000"}
    if year is not None:q["TIME_PERIOD"]=str(year)
    u=url+"?"+urllib.parse.urlencode(q)
    try:
        raw=request(u,"application/json");obj=json.loads(raw.decode());records=extract_records(obj)
        return {"ok":True,"url":u,"recordCount":len(records),"sha256":hashlib.sha256(raw).hexdigest(),"records":records}
    except Exception as e:return {"ok":False,"url":u,"recordCount":0,"error":f"{type(e).__name__}: {e}","records":[]}

def col(ref):
    n=0
    for c in "".join(x for x in ref if x.isalpha()).upper():n=n*26+ord(c)-64
    return max(n-1,0)

def shared(z):
    try:root=ET.fromstring(z.read("xl/sharedStrings.xml"))
    except KeyError:return []
    ns={"a":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    return ["".join(t.text or "" for t in si.findall(".//a:t",ns)) for si in root.findall("a:si",ns)]

def sheets(z):
    main={"a":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}; rel={"r":"http://schemas.openxmlformats.org/package/2006/relationships"}
    wb=ET.fromstring(z.read("xl/workbook.xml"));rs=ET.fromstring(z.read("xl/_rels/workbook.xml.rels"));m={r.attrib["Id"]:r.attrib["Target"] for r in rs.findall("r:Relationship",rel)};out=[]
    for s in wb.findall("a:sheets/a:sheet",main):
        rid=s.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id");t=m.get(rid or "")
        if t:out.append((s.attrib.get("name","Feuille"),t.lstrip("/") if t.startswith("/") else "xl/"+t.lstrip("/")))
    return out

def rowsheet(z,path,ss):
    ns={"a":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"};root=ET.fromstring(z.read(path));out=[]
    for r in root.findall(".//a:sheetData/a:row",ns):
        vals={};maxi=-1
        for c in r.findall("a:c",ns):
            i=col(c.attrib.get("r","A1"));maxi=max(maxi,i);typ=c.attrib.get("t");v=None
            if typ=="inlineStr":v="".join(t.text or "" for t in c.findall(".//a:t",ns))
            else:
                e=c.find("a:v",ns);raw=e.text if e is not None else None
                if raw is not None and typ=="s":
                    try:v=ss[int(raw)]
                    except (ValueError,IndexError):v=raw
                elif raw is not None:v=raw
            vals[i]=v
        if maxi>=0:out.append([vals.get(i) for i in range(maxi+1)])
    return out

def tabular_xlsx(p):
    out=[];names=[]
    with zipfile.ZipFile(p) as z:
        ss=shared(z)
        for name,path in sheets(z):
            names.append(name); rows=rowsheet(z,path,ss)
            scored=[(sum(1 for w in ("indicateur","annee","sexe","age","majorite","nationalite","nombre") if w in " | ".join(norm(v) for v in row if v not in (None,""))),i) for i,row in enumerate(rows[:40])]
            score,h=max(scored,default=(0,0))
            if score<4:continue
            headers=[re.sub(r"\s+"," ",str(v or "")).strip() for v in rows[h]]
            for raw in rows[h+1:]:
                if not any(v not in (None,"") for v in raw):continue
                rec={"__sheet":name}
                for i,k in enumerate(headers):
                    if k and i<len(raw):rec[k]=raw[i]
                out.append(rec)
    return out,names

def findkey(r:dict,aliases:Iterable[str]):
    keys=[k for k in r if not k.startswith("__")]; n={k:norm(k) for k in keys}
    for a in map(norm,aliases):
        for k,v in n.items():
            if v==a:return k
    for a in map(norm,aliases):
        for k,v in n.items():
            if a in v:return k
    return None

def total(v):return norm(v) in {"ensemble","total","tous","toutes","_t","tous ages","toutes nationalites"} or norm(v).startswith("ensemble ")
def nat(v):
    n=norm(v)
    if total(v):return "Ensemble"
    if "franc" in n and "etrang" not in n:return "Française"
    if "etrang" in n:return "Étrangère"
    return str(v or "Non renseignée").strip()

def normalise(r,role):
    ki=findkey(r,["indicateur"]);ky=findkey(r,["année","annee"]);ks=findkey(r,["sexe"]);ka=findkey(r,["âge","age"]);km=findkey(r,["majorité","majorite"]);kn=findkey(r,["nationalité","nationalite"]);kv=findkey(r,["nombre","effectif","nb"]);kd=findkey(r,["statut de diffusion","diffusion","statut"])
    if any(k is None for k in (ki,ky,ks,ka,km,kn,kv)):return None
    y=number(r.get(ky or ""));ind=str(r.get(ki or "","")).strip()
    if y is None or not ind or not 2000<=int(y)<=2100:return None
    raw=r.get(kv or "");status=str(r.get(kd or "","") or "").strip();secret=norm(raw).startswith("secr") or "secr" in norm(status);value=None if secret else number(raw)
    if value is not None and value<0:raise ValueError(f"Valeur négative: {ind} {y}")
    return {"role":role,"indicator":ind,"year":int(y),"sex":str(r.get(ks or "","")).strip(),"age":str(r.get(ka or "","")).strip(),"majority":str(r.get(km or "","")).strip(),"nationality":nat(r.get(kn or "")),"nationalityRaw":str(r.get(kn or "","")).strip(),"value":value,"secret":secret,"disseminationStatus":status,"sheet":r.get("__sheet","")}

def ssmsi(force=False):
    allrows=[];files=[]
    for role,url,name in (("victimes",SSMSI_VICTIMS,"ssmsi-victimes.xlsx"),("mis_en_cause",SSMSI_SUSPECTS,"ssmsi-mis-en-cause.xlsx")):
        p,sha=download(url,name,force);raw,names=tabular_xlsx(p);n=[x for x in (normalise(r,role) for r in raw) if x is not None];allrows.extend(n);files.append({"role":role,"url":url,"sha256":sha,"sheets":names,"parsedRows":len(n)})
    unique={}
    for r in allrows:
        k=(r["role"],r["indicator"],r["year"],r["sex"],r["age"],r["majority"],r["nationality"]);unique.setdefault(k,r)
    obs=sorted(unique.values(),key=lambda r:(r["role"],r["indicator"],r["year"],r["sex"],r["age"],r["nationality"]))
    annual=[r for r in obs if total(r["sex"]) and total(r["age"]) and total(r["majority"])]
    ages=[r for r in obs if total(r["sex"]) and not total(r["age"]) and total(r["majority"]) and r["nationality"]=="Ensemble"]
    sexes=[r for r in obs if not total(r["sex"]) and total(r["age"]) and total(r["majority"]) and r["nationality"]=="Ensemble"]
    groups={}
    for r in annual:groups.setdefault((r["role"],r["indicator"],r["year"]),{})[r["nationality"]]=r
    issues=[]
    for (role,ind,y),g in groups.items():
        trio=[g.get("Ensemble"),g.get("Française"),g.get("Étrangère")]
        if any(x is None for x in trio):continue
        t,f,e=trio
        if any(x["secret"] or x["value"] is None for x in (t,f,e)):continue
        d=float(t["value"])-float(f["value"])-float(e["value"])
        if abs(d)>1e-9:issues.append({"role":role,"indicator":ind,"year":y,"delta":d})
    years=sorted({r["year"] for r in obs});inds={role:sorted({r["indicator"] for r in obs if r["role"]==role}) for role in ("victimes","mis_en_cause")};secrets=sum(r["secret"] for r in obs);numeric=sum(r["value"] is not None for r in obs)
    return {"observations":obs,"annualTotals":annual,"ageProfiles":ages,"sexProfiles":sexes,"years":years,"indicators":inds},{"files":files,"observationCount":len(obs),"annualTotalCount":len(annual),"ageProfileCount":len(ages),"sexProfileCount":len(sexes),"secretCount":secrets,"completenessPercent":round(100*numeric/len(obs),2) if obs else 0,"reconciliationIssueCount":len(issues),"reconciliationIssues":issues[:100],"warnings":[]}

def build(force=False):
    ir,im=insee(force);ma=melodi(INSEE_ANNUEL,2025);ms=melodi(INSEE_SERIES);sd,qa=ssmsi(force);subset=[]
    if ma.get("ok"):
        for r in ma["records"]:
            if str(r.get("TIME_PERIOD"))=="2025" and r.get("IMMI") not in (None,"_T"):
                subset.append({k:r.get(k) for k in ("AGE","SEX","IMMI","EEC_MEASURE","TIME_PERIOD","OBS_VALUE_NIVEAU","PCS","EDUC","ACTIVITY") if k in r})
                if len(subset)>=250:break
    generated=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    return {"meta":{"title":"Laboratoire INSEE — observatoire national","generatedAtUtc":generated,"synthetic":False,"scope":"France entière pour SSMSI; France hors Mayotte pour le croisement migratoire INSEE conformément au champ publié","yearsRequested":"2016-2025","rules":{"ssmsiAnnualTotal":"sexe=Ensemble AND âge=Ensemble AND majorité=Ensemble; aucune sommation des marges","secret":"Les cellules 'secr.' restent nulles, ne sont ni imputées ni transformées en zéro","nationalityReconciliation":"En l'absence de secret: Ensemble = Française + Étrangère","association":"Uniquement séries SSMSI de même indicateur, même année nationale et dénominateurs compatibles"}},"sources":{"inseeMelodiAnnuel":{"producer":"Insee","dataset":"DD_EEC_ANNUEL","url":INSEE_ANNUEL},"inseeMelodiSeries":{"producer":"Insee","dataset":"DD_EEC_SERIES","url":INSEE_SERIES},"inseeControl":{"producer":"Insee",**im},"ssmsiVictims":{"producer":"SSMSI / ministère de l'Intérieur","url":SSMSI_VICTIMS},"ssmsiSuspects":{"producer":"SSMSI / ministère de l'Intérieur","url":SSMSI_SUSPECTS},"ssmsiDataset":{"producer":"SSMSI / ministère de l'Intérieur","url":SSMSI_PAGE},"justice":{"producer":"Ministère de la Justice","url":JUSTICE_PAGE}},"insee":{"year":2025,"observations":ir,"melodi":{"annual":{k:v for k,v in ma.items() if k!="records"},"series":{k:v for k,v in ms.items() if k!="records"},"auditableSubset":subset}},"ssmsi":sd,"justice":{"status":"unavailable_compatible_series","message":"Donnée indisponible : aucune série ouverte récente et méthodologiquement compatible n’a été identifiée.","reason":"Les unités, dates et champs des condamnations ne sont pas directement superposables aux victimes enregistrées ou aux mis en cause SSMSI; aucune comparaison causale ou taux de conversion n'est calculé."},"quality":{"inseeObservationCount":len(ir),**qa,"availableVariables":["rôle","année","indicateur","nationalité","sexe","âge","majorité","nombre","statut de diffusion"],"unavailableVariables":["lien individuel victimes-mis en cause","condamnation liée à un mis en cause SSMSI","immigration dans les données SSMSI"]}}

def write(data,out):
    out.parent.mkdir(parents=True,exist_ok=True);fd,tmp=tempfile.mkstemp(prefix="official-national-observations-",suffix=".json",dir=out.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as f:json.dump(data,f,ensure_ascii=False,separators=(",",":"));f.write("\n")
        Path(tmp).replace(out)
    except Exception:Path(tmp).unlink(missing_ok=True);raise

def main():
    p=argparse.ArgumentParser();p.add_argument("--force",action="store_true");p.add_argument("--output",type=Path,default=OUT);a=p.parse_args();d=build(a.force);write(d,a.output.resolve());print(json.dumps({"output":str(a.output.resolve()),"generatedAtUtc":d["meta"]["generatedAtUtc"],"insee":len(d["insee"]["observations"]),"ssmsi":d["quality"]["observationCount"],"annualTotals":d["quality"]["annualTotalCount"],"ageProfiles":d["quality"]["ageProfileCount"],"secret":d["quality"]["secretCount"],"reconciliationIssues":d["quality"]["reconciliationIssueCount"]},ensure_ascii=False));return 0
if __name__=="__main__":raise SystemExit(main())
