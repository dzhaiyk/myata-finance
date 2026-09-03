# POS-выписка Halyk (PDF) -> зачисления по дням для импорта в bank_transactions (счёт «Halyk Расчётный ИП»).
# Шаг 0: pdftotext -layout Halyk_Statement.pdf halyk.txt
import re, json, hashlib
from collections import defaultdict
lines=open("halyk.txt").read().splitlines()
ROW=re.compile(r"^(\d{2}\.\d{2}\.\d{4})\s+ИП AKHMETKALI\s+Myata Platinum 4YOU\s+(\d+)\s+(\S+)\s+(Оплата|Возврат)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)")
TX=re.compile(r"^\s+(\d{2}\.\d{2}\.\d{4})\s+г\.")
rows=[]; prev=None
for l in lines:
    m=TX.match(l)
    if m: prev=m.group(1); continue
    m=ROW.match(l)
    if m: rows.append(dict(credit_date=m.group(1), tx_date=prev, terminal=m.group(2), kind=m.group(4), amount=float(m.group(5)), net=float(m.group(6)), fee=float(m.group(7))))
byday=defaultdict(lambda:[0,0,0,0])
for r in rows:
    d=r["credit_date"]; k=d[6:]+"-"+d[3:5]+"-"+d[:2]
    byday[k][0]+=r["amount"]; byday[k][1]+=r["net"]; byday[k][2]+=r["fee"]; byday[k][3]+=1
json.dump({"rows":rows,"by_credit_date":dict(sorted(byday.items()))}, open("halyk_pos.json","w"), ensure_ascii=False)
print("операций:", len(rows), "дней зачисления:", len(byday), "оборот:", round(sum(r["amount"] for r in rows),2), "комиссия:", round(sum(r["fee"] for r in rows),2))
# tx_hash как в src/lib/categorize.js: sha256(date|number|amount|isDebit|beneficiary|purpose[:120]) первые 12 байт
def tx_hash(date, number, amount, is_debit, ben, purpose):
    s=f"{date}|{number}|{amount}|{'true' if is_debit else 'false'}|{ben.strip().lower()}|{purpose[:120].strip().lower()}"
    return hashlib.sha256(s.encode()).hexdigest()[:24]
