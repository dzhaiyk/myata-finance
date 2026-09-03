import json, re
from collections import defaultdict
rows=[json.loads(l) for l in open("stmt_2022_2025.jsonl")]
_seen=set(); _ded=[]
for _r in rows:
    _h=_r.get("tx_hash")
    if _h and _h in _seen: continue
    if _h: _seen.add(_h)
    _ded.append(_r)
print(f"dedupe by tx_hash: {len(rows)} -> {len(_ded)} rows"); rows=_ded
PARTNERS=[("Алмас",r"Алмас Хамитович|Almas Abdeshov|Абдешов"),("Абу",r"Койшиев Абу|Abu-Raikhan|Абу-Райхан"),("Жайык",r"Дауренбеков|Zhaiyk|Жайык"),("Әділет",r"Бақыт Әділет|Adilet"),("Алмаз",r"Ахметқали Алмаз|Akhmetkali|Ahmetkali")]
def partner(b):
    for n,p in PARTNERS:
        if re.search(p,b,re.I): return n
    return None
EXTRA=[ # (field, regex, category) — applied only when base category is weak
 ("beneficiary", r"ПЕРСЕЙ", "cogs_kitchen"),
 ("beneficiary", r"SKbar|ХО\.ХО|Alco Spirits", "cogs_bar"),
 ("beneficiary", r"BBS TRADE|Galleon|АтикоАрго|ИП Kai\b|Занькин|Атшабарова", "cogs_other"),
 ("beneficiary", r"Кар-Тел", "util_internet"),
 ("beneficiary", r"Kafe Soft MD", "opex_software"),
 ("beneficiary", r"Kafe Soft MiX|Kafe Soft Consult", "capex_furniture"),
 ("beneficiary", r"Чокан|KAMI GROUP", "opex_menu"),
 ("beneficiary", r"Махмудова|М.хаметжан", "household"),
 ("beneficiary", r"HEADHUNTER|IT Сервис|И\.Н\. SERVICE", "opex_misc"),
 ("beneficiary", r"Халык-Life|Nomad", "tax_insurance"),
 ("beneficiary", r"VentMont|AirComfort", "opex_repair"),
 ("purpose", r"перевод собственных средств с текущего счета", "cash_withdrawal"),
 ("beneficiary", r"С карты Kaspi Business", "internal"),
 ("beneficiary", r"WOLT|GLOVO|Яндекс.?Еда|Yandex", "acquiring_settlement"),
 ("beneficiary", r"Энерго ?Сбыт|Энергосбыт", "util_electric"),
 ("purpose", r"э/энерг|электро", "util_electric"),
 ("beneficiary", r"ГЕО|2ГИС|apple city", "mkt_2gis"),
 ("beneficiary", r"Komvent|Аэроклимат|Aeroclimate|Торговый Дизайн|БУЙРАКУЛОВ|Атамкулова|Рахметбекова|Байкин|Doorman|RESTOMAG", "capex_other"),
 ("beneficiary", r"Fresh-Decision|Euro Food|Аноли|Aas-food|Семь Морей|Barush|Local beef|Red Beef|PELAGIA|Resto-Bro|Глазурь|KAZROX|Frozen Fruit", "cogs_kitchen"),
 ("beneficiary", r"Lirumax|Almatytrade|Exclusive Union|Бридж Тим|Рэд Тим|Trade Line|Пивная|Вайн|CARAVAN|ESKOBAR|Smart Distribution|Euro Truck|Бар Сервис|Prime Food", "cogs_bar"),
 ("beneficiary", r"Дюсебекова", "services_unknown"),
 ("beneficiary", r"Kaspi Pay|KASPI BANK", "bank_fee"),
]
WEAK={"uncategorized","bank_fee","mkt_other","rent_warehouse"}
def recat(r):
    c=r["category"]; b=r["beneficiary"]; p=r["purpose"]
    pn=partner(b)
    if pn: return ("owner_out" if r["is_debit"] else "owner_in"), pn
    if c in WEAK:
        for f,rx,cat in EXTRA:
            if re.search(rx, r[f] or "", re.I): return cat, None
    return c, None
by=defaultdict(float); owner=defaultdict(float); months_owner=defaultdict(float)
for r in rows:
    if r["hidden"]: continue
    y=r["transaction_date"][:4]; c,pn=recat(r)
    sgn = 1 if r["is_debit"] else -1
    by[(y,c,"D" if r["is_debit"] else "C")]+=r["amount"]
    if pn:
        owner[(y,pn,c)]+=r["amount"]; months_owner[(r["transaction_date"][:7],pn,c)]+=r["amount"]
json.dump({"by":{f"{k[0]}|{k[1]}|{k[2]}":v for k,v in by.items()}, "owner_months":{f"{k[0]}|{k[1]}|{k[2]}":v for k,v in months_owner.items()}}, open("hist_bank.json","w"), ensure_ascii=False)
years=["2022","2023","2024","2025"]
cats=sorted(set(k[1] for k in by), key=lambda c:-sum(by.get((y,c,"D"),0) for y in years))
print(f"{'DEBIT category':22}"+"".join(f"{y:>14}" for y in years))
for c in cats:
    if sum(by.get((y,c,"D"),0) for y in years)==0: continue
    print(f"{c:22}"+"".join(f"{round(by.get((y,c,'D'),0)):>14,}" for y in years))
print(f"\n{'CREDIT category':22}"+"".join(f"{y:>14}" for y in years))
for c in cats:
    if sum(by.get((y,c,"C"),0) for y in years)==0: continue
    print(f"{c:22}"+"".join(f"{round(by.get((y,c,'C'),0)):>14,}" for y in years))
print("\nowner transfers (bank) by year/partner: out / in")
for y in years:
    for pn,_ in PARTNERS:
        o=owner.get((y,pn,"owner_out"),0); i=owner.get((y,pn,"owner_in"),0)
        if o or i: print(f"  {y} {pn:7} out={round(o):>13,}  in={round(i):>13,}")

with open("hist_rows.jsonl","w") as fo:
    for r in rows:
        if r["hidden"]: continue
        c,pn=recat(r); r2=dict(r); r2["hcat"]=c; r2["partner"]=pn; fo.write(json.dumps(r2, ensure_ascii=False)+"\n")
