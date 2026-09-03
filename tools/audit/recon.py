import json, re
from collections import defaultdict
pe=json.load(open("pnl_excel.json")); pd=json.load(open("pnl_daily.json"))["monthly"]; hb=json.load(open("hist_bank.json"))["by"]; zt=json.load(open("zatratki_monthly.json"))
YEARS=("2022","2023","2024","2025")
# интерполяция пропусков кассовых книг (решение учредителя 03.09.2026): 2024-07, 2024-10 = среднее соседних месяцев; 2025-03 (1–15) = ×31/15
def _interp(y, m, a, b):
    la, lb = pd[y].get(str(a), {}), pd[y].get(str(b), {})
    pd[y][str(m)] = {k: (la.get(k,0)+lb.get(k,0))/2 for k in set(la)|set(lb)}
_interp("2024", 7, 6, 8); _interp("2024", 10, 9, 11)
pd["2025"]["3"] = {k: v*31/15 for k,v in pd["2025"]["3"].items()}
def ex(y,*names):
    s=0
    for n in names:
        v=pe[y].get(n)
        if v: s+=sum(x for x in v if isinstance(x,(int,float)))
    return s
def pdl(y,*names):
    s=0
    for m,lines in pd.get(y,{}).items():
        for n in names: s+=lines.get(n,0)
    return s
def bank(y,pred):
    s=0
    for k,v in hb.items():
        yy,cat,dc=k.split("|")
        if yy!=y or not pred(cat): continue
        s+= v if dc=="D" else -v
    return s
cats=sorted({k.split("|")[1] for k in hb}); print("bank categories:", cats)
def pre(*p): return lambda c: c.startswith(p)
def eq(*p): return lambda c: c in p
NONPL={'dividends','owner_in','owner_out','cash_withdrawal','internal','acquiring_settlement','deposit','loan','franchise','other_income'}
def opex_misc_pred(c): return (c.startswith("opex_") and c not in ("opex_software","opex_royalty")) or c in ("services_unknown","uncategorized","household_unknown","misc")
GROUPS=[
 ("Выручка",            lambda y: ex(y,"ДОХОДЫ тенге"),             lambda y: pdl(y,"ДОХОДЫ тенге"), lambda y: 0),
 ("ФОТ",                lambda y: ex(y,"ФОТ"),                      lambda y: pdl(y,"ФОТ"),          lambda y: bank(y,pre("payroll_"))),
 ("Налоги",             lambda y: ex(y,"Налоги"),                   lambda y: pdl(y,"Taxes"),        lambda y: bank(y,pre("tax_"))),
 ("Закуп всего",        lambda y: ex(y,"Закуп","Food cost"),        lambda y: pdl(y,"Закуп","Food cost"), lambda y: bank(y,pre("cogs_"))),
 ("  Закуп кухня",      lambda y: ex(y,"Закуп кухня"),              lambda y: pdl(y,"Закуп кухня"),  lambda y: bank(y,eq("cogs_kitchen"))),
 ("  Закуп бар",        lambda y: ex(y,"Закуп бар"),                lambda y: pdl(y,"Закуп бар"),    lambda y: bank(y,eq("cogs_bar"))),
 ("  Закуп кальян",     lambda y: ex(y,"Закуп кальян"),             lambda y: pdl(y,"Закуп кальян"), lambda y: bank(y,eq("cogs_hookah"))),
 ("  Закуп без отдела", lambda y: 0,                                lambda y: 0,                     lambda y: bank(y,eq("cogs_other"))),
 ("Хозтовары",          lambda y: ex(y,"Хозтовары"),                lambda y: pdl(y,"Хозтовары"),    lambda y: bank(y,eq("household","opex_household"))),
 ("Маркетинг",          lambda y: ex(y,"Маркетинг"),                lambda y: pdl(y,"Маркетинг"),    lambda y: bank(y,pre("mkt_"))),
 ("Аренда",             lambda y: ex(y,"Аренда"),                   lambda y: pdl(y,"Аренда"),       lambda y: bank(y,pre("rent_"))),
 ("Коммуслуги+связь+BI",lambda y: ex(y,"Коммуслуги","Интернет и связь") if y<"2024" else ex(y,"Коммунальные платежи"), lambda y: pdl(y,"Коммуслуги","Интернет и связь","Коммунальные платежи"), lambda y: bank(y,pre("util_"))),
 ("Комиссии банка",     lambda y: ex(y,"Комиссий банка"),           lambda y: pdl(y,"Комиссий банка"), lambda y: bank(y,eq("bank_fee","opex_bank_fee"))),
 ("Роялти",             lambda y: ex(y,"Роялти"),                   lambda y: pdl(y,"Роялти"),       lambda y: bank(y,eq("opex_royalty"))),
 ("Software",           lambda y: ex(y,"Software","Программное обеспечение"), lambda y: pdl(y,"Software"), lambda y: bank(y,eq("opex_software"))),
 ("OpEx прочее (чист.)",lambda y: ex(y,"OpEx прочее") if y<"2024" else ex(y,"OpEx прочее")-ex(y,"Хозтовары","Комиссий банка","Программное обеспечение","Роялти"), lambda y: pdl(y,"OpEx прочее","Прочие расходы") if y<"2024" else pdl(y,"OpEx прочее")-pdl(y,"Хозтовары"), lambda y: bank(y,opex_misc_pred)),
 ("CapEx",              lambda y: ex(y,"CapEx (инвестиции)"),       lambda y: pdl(y,"CapEx (инвестиции)"), lambda y: bank(y,pre("capex_"))),
 ("OpEx итого",         lambda y: ex(y,"OpEx (ежемесячные расходы)"), lambda y: pdl(y,"OpEx (ежемесячные расходы)","OpEx (ежедневные расходы)"), lambda y: bank(y,lambda c: c not in NONPL and not c.startswith("capex_"))),
 ("РАСХОДЫ итого",      lambda y: ex(y,"РАСХОДЫ тенге"),            lambda y: (pdl(y,"РАСХОДЫ тенге") or pdl(y,"OpEx (ежемесячные расходы)")), lambda y: bank(y,lambda c: c not in NONPL)),
]
out={}
for y in YEARS:
    print(f"\n===== {y}: Excel PnL vs (PnL_Daily нал + банк)   [тенге]")
    print(f"{'группа':22}{'Excel':>14}{'нал(PnL_Daily)':>16}{'банк':>14}{'нал+банк':>14}{'Excel−(н+б)':>14}")
    out[y]={}
    for name,fe,fp,fb in GROUPS:
        e=fe(y); p=fp(y); b=fb(y); out[y][name.strip()]=dict(excel=e,cash=p,bank=b)
        print(f"{name:22}{round(e):>14,}{round(p):>16,}{round(b):>14,}{round(p+b):>14,}{round(e-p-b):>14,}")
    print("  банк вне P&L:", {c: round(bank(y,eq(c))) for c in ("acquiring_settlement","dividends","owner_out","owner_in","cash_withdrawal","internal")})
json.dump(out, open("recon_groups.json","w"), ensure_ascii=False)
# monthly revenue: Excel vs PnL_Daily vs Затратки vs Kaspi acquiring credits
acq=defaultdict(float); acq_n=defaultdict(int); _seen=set()
for line in open("stmt_2022_2025.jsonl"):
    t=json.loads(line)
    if t.get("tx_hash") in _seen: continue
    _seen.add(t.get("tx_hash"))
    if t.get("category")=="acquiring_settlement" and not t["is_debit"]:
        acq[t["transaction_date"][:7]]+=t["amount"]; acq_n[t["transaction_date"][:7]]+=1
print(f"\n===== Выручка по месяцам: Excel | PnL_Daily | Затратки итого | Затратки банк | Kaspi эквайринг (кредит по выписке)")
for y in YEARS:
    for m in range(1,13):
        key=f"{y}-{m:02d}"
        e=(pe[y]["ДОХОДЫ тенге"][m-1] or 0); p=pd.get(y,{}).get(str(m),{}).get("ДОХОДЫ тенге",0)
        z=zt.get(key,{}).get("agg",{}); zt_tot=z.get("total",0); zt_bank=z.get("bank",0)+z.get("cashless",0); zt_cash=z.get("cash",0)
        a=acq.get(key,0)
        if not (e or p or zt_tot or a): continue
        print(f"{key}  Excel {round(e):>12,}  PD {round(p):>12,}  Затр {round(zt_tot):>12,} (банк {round(zt_bank):>12,} / нал {round(zt_cash):>11,})  Kaspi {round(a):>12,} n={acq_n.get(key,0)}")
