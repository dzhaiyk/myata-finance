import json
from collections import defaultdict
pe=json.load(open("pnl_excel.json"))
# Excel line -> P&L line key (PnLPage PNL_STRUCTURE). Only leaf lines; group lines are skipped.
MAP_OLD={  # 2022-2023 (35 lines)
 "Кухня":"rev_kitchen","Бар":"rev_bar","Кальян":"rev_hookah","Прочее":"rev_other",
 "Паушальный взнос":"capex_other","Ремонт":"capex_repair","Мебель и техника":"capex_furniture","CAPEX прочее":"capex_other",
 "ФОТ":"payroll_other","Налоги":"tax_other",
 "Закуп кухня":"fc_kitchen","Закуп бар":"fc_bar","Закуп кальян":"fc_hookah",
 "Хозтовары":"opex_household","Маркетинг":"mkt_other","Интернет и связь":"util_internet","Аренда":"rent_premises",
 "Коммуслуги":"util_other","Комиссий банка":"opex_bank_fee","Роялти":"opex_royalty","Software":"opex_software","OpEx прочее":"opex_misc",
}
MAP_NEW={  # 2024-2025 (69/71 lines)
 "Кухня":"rev_kitchen","Бар":"rev_bar","Кальян":"rev_hookah","Прочее":"rev_other",
 "Паушальный взнос":"capex_other","Ремонт":"capex_repair","Мебель и техника":"capex_furniture","CAPEX прочее":"capex_other",
 "ФОТ Менеджмент":"payroll_mgmt","ФОТ Кухня":"payroll_kitchen","ФОТ Бар":"payroll_bar","ФОТ Дымный коктейль":"payroll_hookah","ФОТ Зал":"payroll_hall","Развозка":"payroll_transport","ФОТ Прочее":"payroll_other",
 "Закуп кухня":"fc_kitchen","Закуп бар":"fc_bar","Закуп кальян":"fc_hookah",
 "СММ":"mkt_smm","Таргет":"mkt_target","2ГИС":"mkt_2gis","Яндекс":"mkt_yandex","Google":"mkt_google","Маркетинг прочее":"mkt_other",
 "Аренда помещения":"rent_premises","Аренда склада и кровли":"rent_warehouse","Налог на недвижимость":"rent_property_tax",
 "Электричество":"util_electric","Водоснабжение":"util_water","Отопление":"util_heating","BI Service":"util_bi","Интернет и связь":"util_internet","Вывоз мусора":"util_waste","Ком услуги прочее":"util_other",
 "Хозтовары":"opex_household","Комиссий банка":"opex_bank_fee","Система безопасности":"opex_security","Программное обеспечение":"opex_software","Меню":"opex_menu",
 "Дератизация/дезинсекция":"opex_pest","Чистка жироуловителей":"opex_grease","Мелкий ремонт":"opex_repair","Форма для персонала":"opex_uniform","Авторские права на музыку":"opex_music","Роялти":"opex_royalty","Прочее#2":"opex_misc",
 "Розничный налог":"tax_retail","Налоги по зарплате":"tax_payroll","Страхование сотрудников":"tax_insurance","Лицензия на алкоголь":"tax_alcohol","Лицензия на кальян":"tax_hookah","Налоги прочее":"tax_other",
}
GROUPS_OLD={"ДОХОДЫ тенге","РАСХОДЫ тенге","CapEx (инвестиции)","OpEx (ежемесячные расходы)","Закуп"}
GROUPS_NEW={"ДОХОДЫ тенге","РАСХОДЫ тенге","CapEx (инвестиции)","OpEx (ежемесячные расходы)","ФОТ","Food cost","Маркетинг","Аренда","Коммунальные платежи","OpEx прочее","Налоги"}
IGNORE_PREFIX=("Операционная прибыль","Чистая прибыль","Маржа","Себестоимость","Кухня#2","Бар#2","Кальян#2","Окупаемость","Food cost в %","Прочее#3")
rows=[]; unmapped=defaultdict(float); tot=defaultdict(lambda: defaultdict(float))
for y in ("2022","2023","2024","2025"):
    MAP=MAP_OLD if y<"2024" else MAP_NEW; GROUPS=GROUPS_OLD if y<"2024" else GROUPS_NEW
    for line,vals in pe[y].items():
        name=line.strip()
        if name in GROUPS or name.startswith(IGNORE_PREFIX): continue
        key=MAP.get(name)
        vals=[v if isinstance(v,(int,float)) else 0 for v in vals]
        if key is None:
            if any(vals): unmapped[(y,name)]+=sum(vals)
            continue
        for m,v in enumerate(vals, start=1):
            if abs(v)<0.5: continue
            rows.append((int(y),m,key,round(v,2))); tot[y][key]+=v
print("не сопоставлено (ненулевые):", dict(unmapped))
for y in tot:
    rev=sum(v for k,v in tot[y].items() if k.startswith("rev_")); exp=sum(v for k,v in tot[y].items() if not k.startswith("rev_"))
    print(f"{y}: строк {sum(1 for r in rows if r[0]==int(y))}, выручка {rev:,.0f}, расходы {exp:,.0f}, прибыль {rev-exp:,.0f}")
    print("   ", {k: round(v) for k,v in sorted(tot[y].items())})
json.dump(rows, open("reimport_rows.json","w"))
with open("sql/reimport_hist.sql","w") as f:
    f.write("-- Переимпорт исторического P&L 2022–2025 из Excel (аудит 03.09.2026). Заменяет строки type='historical'.\n")
    f.write("BEGIN;\nDELETE FROM public.pnl_data WHERE year BETWEEN 2022 AND 2025 AND type='historical';\n")
    f.write("INSERT INTO public.pnl_data (year, month, category, amount, source, description, type) VALUES\n")
    f.write(",\n".join(f"({y},{m},'{k}',{a},'manual','Импорт из Excel PnL (аудит 03.09.2026)','historical')" for y,m,k,a in rows))
    f.write(";\nCOMMIT;\n")
print("rows:", len(rows), "-> sql/reimport_hist.sql")
