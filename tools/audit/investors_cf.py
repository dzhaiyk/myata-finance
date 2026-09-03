# Дивиденды и взносы партнёров из «2. Cash flow.xlsx» (листы «Внесения и инкассации_<год>») -> cf_partners.json
# и SQL выравнивания investor_transactions 2022–2024 (выполнять только после подтверждения учредителя).
import openpyxl, json, calendar
ROOT="/Users/jakedaurenbekov/Projects/myata-finance/docs/Accounting/1. ОПиУ и ДДС/"
MON={'Январь':1,'Февраль':2,'Март':3,'Апрель':4,'Май':5,'Июнь':6,'Июль':7,'Август':8,'Сентябрь':9,'Октябрь':10,'Ноябрь':11,'Декабрь':12}
IDS={"Жайык":1,"Алмас":2,"Абу":3}
wb=openpyxl.load_workbook(ROOT+"2. Cash flow.xlsx", read_only=True, data_only=True)
cf={}
for y in (2022,2023,2024,2025):
    rows=list(wb[f"Внесения и инкассации_{y}"].iter_rows(values_only=True))
    hdr=next(r for r in rows if r and r[1]=="Месяц"); names=[hdr[2],hdr[3],hdr[4]]
    for r in rows:
        if r and isinstance(r[1],str) and r[1] in MON:
            for i,n in enumerate(names):
                v=r[2+i]
                if isinstance(v,(int,float)) and v: cf[f"{y}-{MON[r[1]]:02d}|{n}"]=float(v)
json.dump(cf, open("cf_partners.json","w"), ensure_ascii=False)
rows=[(IDS[k.split("|")[1]], f"{k[:4]}-{k[5:7]}-{calendar.monthrange(int(k[:4]),int(k[5:7]))[1]:02d}", "investment" if v>0 else "dividend", abs(v)) for k,v in sorted(cf.items()) if int(k[:4])<=2024]
sql=("BEGIN;\nDELETE FROM public.investor_transactions WHERE transaction_date >= '2022-01-01' AND transaction_date < '2025-01-01' AND type IN ('investment','dividend');\n"
     "INSERT INTO public.investor_transactions (investor_id, transaction_date, type, amount, notes)\nSELECT (e->>0)::int, (e->>1)::date, e->>2, (e->>3)::numeric, 'Cash flow (аудит 03.09.2026)' FROM jsonb_array_elements($j$"
     + json.dumps([[r[0],r[1],r[2],r[3]] for r in rows], ensure_ascii=False, separators=(",",":")) + "$j$::jsonb) e;\nCOMMIT;\n")
open("investors_cf.sql","w").write(sql); print("строк:", len(rows))
